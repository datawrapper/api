const { customAlphabet } = require('nanoid');
const { camelizeKeys } = require('humps');
const Boom = require('@hapi/boom');
const path = require('path');
const jsesc = require('jsesc');
const crypto = require('crypto');
const fs = require('fs-extra');
const get = require('lodash/get');
const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

const utils = {};

utils.prepareChart = async (chart, additionalData = {}) => {
    const { user, in_folder, ...dataValues } = chart.dataValues;

    const publicId =
        typeof chart.getPublicId === 'function' ? await chart.getPublicId() : undefined;

    return {
        ...camelizeKeys(additionalData),
        publicId,
        language: 'en_US',
        theme: 'datawrapper',
        ...camelizeKeys(dataValues),
        folderId: in_folder,
        metadata: dataValues.metadata,
        author: user ? { name: user.name, email: user.email } : undefined,
        guestSession: undefined
    };
};

utils.stringify = obj => {
    return jsesc(JSON.stringify(obj), {
        isScriptContext: true,
        json: true,
        wrap: true
    });
};

function createHashedFileName(filePath, hash) {
    const ext = path.extname(filePath);
    const name = [path.basename(filePath, ext), hash].join('.');
    return path.format({ name, ext });
}

utils.copyFileHashed = (filePath, destination, { prefix, hashLength = 8 } = {}) => {
    let hash = crypto.createHash('sha256');
    const outFileName = path.basename(filePath);

    const outFilePath = path.join(destination, `temp-${utils.generateToken(5)}-${outFileName}`);
    const input = fs.createReadStream(filePath);
    const output = fs.createWriteStream(outFilePath);

    input.pipe(output);
    input.on('data', chunk => {
        hash.update(chunk);
    });

    return new Promise((resolve, reject) => {
        input.on('error', reject);
        output.on('error', reject);

        output.on('finish', rename);
        async function rename() {
            hash = hash.digest('hex').slice(0, hashLength);
            let hashedFileName = createHashedFileName(filePath, hash);
            if (prefix) {
                hashedFileName = `${prefix}.${hashedFileName}`;
            }
            await fs.move(outFilePath, path.join(destination, hashedFileName));
            resolve(hashedFileName);
        }
    });
};

utils.readFileAndHash = async (filePath, hashLength = 8) => {
    const content = await fs.readFile(filePath, { encoding: 'utf-8' });
    let hash = crypto.createHash('sha256');

    hash.update(content);
    hash = hash.digest('hex').slice(0, hashLength);

    return {
        fileName: createHashedFileName(filePath, hash),
        content
    };
};

utils.cookieTTL = days => {
    return 1000 * 3600 * 24 * days; // 1000ms = 1s -> 3600s = 1h -> 24h = 1d
};

utils.generateToken = (length = 25) => {
    return customAlphabet(alphabet, length)();
};

utils.noop = () => {};

utils.loadChart = async function (id) {
    const { Op } = require('@datawrapper/orm').db;
    const { Chart } = require('@datawrapper/orm/models');

    const chart = await Chart.findOne({
        where: {
            id,
            deleted: { [Op.not]: true }
        }
    });

    if (!chart) {
        throw Boom.notFound();
    }

    return chart;
};

utils.copyChartAssets = function (server) {
    const { event, events } = server.app;
    return async function (srcChart, chart, copyPublic = false) {
        const assets = ['.csv', '.map.json', '.minimap.json', '.highlight.json'];
        for (const filename of assets) {
            try {
                const stream = await events.emit(
                    event.GET_CHART_ASSET,
                    {
                        chart: srcChart,
                        filename:
                            srcChart.id +
                            (filename === '.csv' && copyPublic ? '.public.csv' : filename)
                    },
                    { filter: 'first' }
                );

                let data = '';

                for await (const chunk of stream) {
                    data += chunk;
                }

                await events.emit(event.PUT_CHART_ASSET, {
                    chart,
                    filename: chart.id + filename,
                    data
                });
            } catch (ex) {
                console.error(ex);
                continue;
            }
        }
    };
};

utils.getAdditionalMetadata = async (chart, { server }) => {
    const data = {};
    let additionalMetadata = await server.app.events.emit(
        server.app.event.ADDITIONAL_CHART_DATA,
        {
            chartId: chart.id,
            forkedFromId: chart.forked_from
        },
        { filter: 'success' }
    );

    additionalMetadata = Object.assign({}, ...additionalMetadata);

    if (chart.forked_from && chart.is_fork) {
        const { Chart } = require('@datawrapper/orm/models');

        const forkedFromChart = await Chart.findByPk(chart.forked_from, {
            attributes: ['metadata']
        });
        const basedOnBylineText = get(forkedFromChart, 'metadata.describe.byline', null);

        if (basedOnBylineText) {
            let basedOnUrl = get(additionalMetadata, 'river.source_url', null);

            if (!basedOnUrl) {
                let results = await server.app.events.emit(
                    server.app.event.GET_CHART_DISPLAY_URL,
                    {
                        chart
                    },
                    { filter: 'success' }
                );

                results = Object.assign({}, ...results);
                basedOnUrl = results.url;
            }

            data.basedOnByline = basedOnUrl
                ? `<a href='${basedOnUrl}' target='_blank' rel='noopener'>${basedOnBylineText}</a>`
                : basedOnBylineText;
        }
    }

    return data;
};

module.exports = utils;

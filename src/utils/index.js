const generate = require('nanoid/generate');
const { camelizeKeys } = require('humps');
const Boom = require('@hapi/boom');
const path = require('path');
const jsesc = require('jsesc');
const crypto = require('crypto');
const fs = require('fs-extra');
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

utils.writeFileHashed = async function (name, value, destination, { prefix, hashLength = 8 } = {}) {
    let hash = crypto.createHash('sha256');
    hash.update(value);
    hash = hash.digest('hex').slice(0, hashLength);
    let hashedFileName = createHashedFileName(name, hash);
    if (prefix) {
        hashedFileName = `${prefix}.${hashedFileName}`;
    }
    await fs.writeFile(path.join(destination, hashedFileName), value);
    return hashedFileName;
};

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
    return generate(alphabet, length);
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

module.exports = utils;

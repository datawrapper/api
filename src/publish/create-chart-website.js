const Boom = require('@hapi/boom');
const path = require('path');
const fs = require('fs-extra');
const os = require('os');
const pug = require('pug');
const { Team } = require('@datawrapper/orm/models');
const chartCore = require('@datawrapper/chart-core');
const dwChart = require('@datawrapper/chart-core/dist/dw-2.0.cjs.js').dw.chart;
const get = require('lodash/get');
const {
    stringify,
    readFileAndHash,
    copyFileHashed,
    writeFileHashed,
    noop
} = require('../utils/index.js');
const renderHTML = pug.compileFile(path.resolve(__dirname, './index.pug'));

/**
 * @typedef {Object} Options
 * @property {Object} auth - Hapi.js `auth` object
 * @property {Object} server - Hapi.js `server` object
 * @property {function} [log] - Logging function
 * @property {boolean} [includePolyfills] - Flag to decide if polyfills should get included
 * @property {boolean} [flatRessources] - Flag to rewrite asset paths in index.html
 * @property {boolean} [publish] - Flag to indicate that this chart is to be published (not previewed or exported)
 */

/**
 * @typedef {Object} Result
 * @property {Object} chart - Sequelize Chart model
 * @property {string} data - Chart data (usually csv)
 * @property {string} outDir - Path to the chart website
 * @property {string[]} fileMap - List of files included in `outDir`
 * @property {function} cleanup - Function to remove `outDir`
 */

/**
 * Creates a static website for a given chart.
 * Used for publishing and zip export.
 *
 * @param {string} chartId - ID of the chart
 * @param {Options} options
 * @returns {Result}
 */
module.exports = async function createChartWebsite(
    chart,
    {
        auth,
        headers,
        server,
        log = noop,
        includePolyfills = true,
        flatRessources = false,
        publish = false,
        onlyEmbedJS = false
    } = {}
) {
    /**
     * Load chart information
     * (including metadata, data, basemaps, etc.)
     */
    let { result: publishData } = await server.inject({
        url: `/v3/charts/${chart.id}/publish/data${publish ? '?publish=true' : ''}`,
        auth,
        headers
    });

    if (chart.error) {
        throw Boom.notFound();
    }

    if (!publishData.data) {
        await log('error-data');
        throw Boom.conflict('No chart data available.');
    }

    const team = await Team.findByPk(chart.organization_id);
    const chartLocale = publishData.chart.language || 'en-US';
    const locales = {
        dayjs: await loadVendorLocale('dayjs', chartLocale, team),
        numeral: await loadVendorLocale('numeral', chartLocale, team)
    };

    // no need to await this...
    log('preparing');

    publishData = Object.assign(publishData, {
        isIframe: true,
        isPreview: false,
        locales,
        polyfillUri: `../../lib/vendor`
    });

    const assetMap = {};
    const originalAssets = publishData.assets;

    publishData.assets.forEach(({ name, value }) => {
        assetMap[name] = {
            value
        };
    });
    publishData.assets = assetMap;

    log('rendering');

    async function getEmbedJS(parameters) {
        const webComponentJS = await fs.readFile(
            path.join(chartCore.path.dist, 'web-component.js'),
            'utf-8'
        );

        const { result: embedCodes } = await server.inject({
            url: `/v3/charts/${chart.id}/embed-codes`,
            auth,
            headers
        });

        const responsiveEmbed = embedCodes
            .filter(el => el.id === 'responsive')[0]
            .code.replace(/'/g, "\\'")
            .replace(/\//g, '\\/')
            .replace(/\n/g, '');

        // be careful: this needs to run in IE11, too
        const embedJS = `(function() {
// determine the script origin
var scripts = document.getElementsByTagName('script');

var origin = scripts[scripts.length - 1]
    .getAttribute('src')
    .split('/')
    .slice(0, -1)
    .join('/');

if (!document.head.attachShadow) {
    // all bets are off, back to iframe
    var responsiveEmbed = '${responsiveEmbed}';
    document.write(responsiveEmbed.replace(/src="null"/g, 'src="' + origin + '/index.html"'));
} else {
    ${webComponentJS}

    __dw.render(Object.assign(
        ${JSON.stringify(parameters)},
        { origin: origin }
    ));
}})()`;
        return embedJS;
    }

    if (onlyEmbedJS) {
        const frontend = server.methods.config('frontend');
        const api = server.methods.config('api');

        const frontendBase = `${frontend.https ? 'https' : 'http'}://${frontend.domain}`;
        const chartCoreBase = `${frontendBase}/lib/chart-core`;

        publishData.dependencies = [
            `${chartCoreBase}/dw-2.0.min.js`,
            ...publishData.visualization.libraries,
            `${api.https ? 'https' : 'http'}://${api.subdomain}.${api.domain}/v3/visualizations/${
                publishData.visualization.id
            }/script.js`
        ];

        publishData.blocks = publishData.blocks.map(block => {
            block.source.js = `${frontendBase}${block.source.js}`;
            block.source.css = `${frontendBase}${block.source.css}`;
            return block;
        });

        return await getEmbedJS(publishData);
    }

    const { html, head } = chartCore.svelte.render(publishData);

    let dependencies = ['dw-2.0.min.js'].map(file => path.join(chartCore.path.dist, file));

    /* Create a temporary directory */
    const outDir = await fs.mkdtemp(path.resolve(os.tmpdir(), `dw-chart-${chart.id}-`));

    /* Copy assets */
    const assets = {};
    const assetsFiles = [];
    for (const asset of originalAssets) {
        const { name, prefix, shared, value } = asset;
        if (!shared) {
            assets[name] = {
                value
            };
        } else {
            const hashed = await writeFileHashed(name, value, outDir);
            const assetPath = (prefix ? prefix + '/' : '') + hashed;

            assets[name] = {
                shared: true,
                url: getAssetLink(`../../lib/${assetPath}`)
            };

            assetsFiles.push(`lib/${assetPath}`);
        }
    }
    publishData.assets = assets;

    /* Copy dependencies into temporary directory and hash them on the way */
    const dependencyPromises = [
        dependencies,
        publishData.visualization.libraries.map(lib => lib.file)
    ]
        .flat()
        .map(filePath => copyFileHashed(filePath, outDir));

    dependencies = (await Promise.all(dependencyPromises)).map(file =>
        path.join('lib/vendor/', file)
    );

    const { fileName, content } = await readFileAndHash(publishData.visualization.script);

    const [coreScript] = await Promise.all([
        copyFileHashed(path.join(chartCore.path.dist, 'main.js'), path.join(outDir)),
        fs.writeFile(path.join(outDir, fileName), content)
    ]);

    const [polyfillScript] = await Promise.all([
        copyFileHashed(path.join(chartCore.path.dist, 'load-polyfills.js'), path.join(outDir)),
        fs.writeFile(path.join(outDir, fileName), content)
    ]);

    dependencies.push(path.join('lib/vis/', fileName));

    function getAssetLink(asset) {
        return flatRessources ? path.basename(asset) : asset;
    }

    const blocksFilePromises = publishData.blocks
        .filter(block => block.include && block.prefix)
        .map(async ({ prefix, publish, blocks }) => {
            const [js, css] = await Promise.all([
                copyFileHashed(publish.js, outDir, { prefix }),
                copyFileHashed(publish.css, outDir, { prefix })
            ]);
            return {
                source: {
                    js: getAssetLink(`../../lib/blocks/${js}`),
                    css: getAssetLink(`../../lib/blocks/${css}`)
                },
                blocks
            };
        });

    const publishedBlocks = await Promise.all(blocksFilePromises);
    const blocksFiles = publishedBlocks
        .map(({ source }) => [source.js.replace('../../', ''), source.css.replace('../../', '')])
        .flat();

    publishData.blocks = publishedBlocks;

    const { css, fonts } = publishData.styles;
    delete publishData.styles;

    /**
     * Render the visualizations entry: "index.html"
     */
    const indexHTML = renderHTML({
        __DW_SVELTE_PROPS__: stringify(publishData),
        CHART_LANGUAGE: chartLocale.split(/_|-/)[0],
        META_ROBOTS: 'noindex, nofollow',
        CHART_HTML: html,
        CHART_HEAD: head,
        POLYFILL_SCRIPT: getAssetLink(`../../lib/${polyfillScript}`),
        CORE_SCRIPT: getAssetLink(`../../lib/${coreScript}`),
        SCRIPTS: dependencies.map(file => getAssetLink(`../../${file}`)),
        CSS: `${fonts}\n${css}`,
        CHART_CLASS: [
            `vis-height-${get(publishData.visualization, 'height', 'fit')}`,
            `theme-${get(publishData.theme, 'id')}`,
            `vis-${get(publishData.visualization, 'id')}`
        ]
    });

    publishData.dependencies = dependencies.map(file => getAssetLink(`../../${file}`));

    let polyfillFiles = [];
    if (includePolyfills) {
        /* Copy polyfills to destination */
        const polyfillPromises = chartCore.polyfills.map(async filePath => {
            const file = path.basename(filePath);
            await fs.copyFile(filePath, path.join(outDir, file));
            return path.join('lib/vendor/', file);
        });
        polyfillFiles = await Promise.all(polyfillPromises);
    }

    publishData.dependencies = dependencies.map(file => getAssetLink(`../../${file}`));

    await fs.writeFile(path.join(outDir, 'embed.js'), await getEmbedJS(publishData), {
        encoding: 'utf-8'
    });

    /* write "index.html", visualization Javascript and other assets */
    await fs.writeFile(path.join(outDir, 'index.html'), indexHTML, { encoding: 'utf-8' });

    /* write "data.csv", including changes made in step 2 */
    const dataset = await dwChart(publishData.chart).load(publishData.data);
    const isJSON = get(publishData.chart, 'metadata.data.json');
    const dataFile = `data.${isJSON ? 'json' : 'csv'}`;
    await fs.writeFile(
        path.join(outDir, dataFile),
        isJSON ? JSON.stringify(dataset) : dataset.csv(),
        { encoding: 'utf-8' }
    );

    const fileMap = [
        ...dependencies,
        ...polyfillFiles,
        ...blocksFiles,
        ...assetsFiles,
        path.join('lib/', polyfillScript),
        path.join('lib/', coreScript),
        'index.html',
        'embed.js',
        dataFile
    ];

    async function cleanup() {
        await fs.remove(outDir);
    }

    return { data: publishData.data, outDir, fileMap, cleanup };
};

async function loadVendorLocale(vendor, locale, team) {
    const basePath = path.resolve(
        __dirname,
        '../../node_modules/@datawrapper/locales/locales/',
        vendor
    );
    const culture = locale.replace('_', '-').toLowerCase();
    const tryFiles = [`${culture}.js`];
    if (culture.length > 2) {
        // also try just language as fallback
        tryFiles.push(`${culture.substr(0, 2)}.js`);
    }
    for (let i = 0; i < tryFiles.length; i++) {
        const file = path.join(basePath, tryFiles[i]);
        try {
            const localeBase = await fs.readFile(file, 'utf-8');
            return {
                base: localeBase,
                custom: get(team, `settings.locales.${vendor}.${locale.replace('_', '-')}`, {})
            };
        } catch (e) {
            // file not found, so try next
        }
    }
    // no locale found at all
    return 'null';
}

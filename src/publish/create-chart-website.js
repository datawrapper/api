const Boom = require('@hapi/boom');
const path = require('path');
const fs = require('fs-extra');
const os = require('os');
const pug = require('pug');
const { Theme } = require('@datawrapper/orm/models');
const chartCore = require('@datawrapper/chart-core');
const { getDependencies } = require('@datawrapper/chart-core/lib/get-dependencies');
const get = require('lodash/get');
const { stringify, readFileAndHash, copyFileHashed, noop } = require('../utils/index.js');

const { compileCSS } = require('./compile-css');
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
        publish = false
    } = {}
) {
    const { visualizations } = server.app;

    /**
     * Load chart information
     * (including metadata, data, basemaps, etc.)
     */
    const { result: publishData } = await server.inject({
        url: `/v3/charts/${chart.id}/publish/data${publish ? '?publish=true' : ''}`,
        auth,
        headers
    });

    if (chart.error) {
        throw Boom.notFound();
    }

    const { data } = publishData;
    const chartJSON = publishData.chart;
    const locale = chart.language || 'en-US';

    delete publishData.data;
    delete publishData.chart;

    if (!data) {
        await log('error-data');
        throw Boom.conflict('No chart data available.');
    }

    /**
     * Load visualization information
     */
    const vis = visualizations.get(chart.type);
    if (!vis) {
        await log('error-vis-not-supported');
        throw Boom.notImplemented(`"${chart.type}" is currently not supported.`);
    }

    // load vendor locales needed by visualization
    const locales = {};
    if (vis.dependencies.dayjs) {
        locales.dayjs = await loadVendorLocale('dayjs', locale);
    }
    if (vis.dependencies.numeral) {
        locales.numeral = await loadVendorLocale('numeral', locale);
    }

    // no need to await this...
    log('preparing');

    /**
     * Load theme information
     */
    let theme = await Theme.findByPk(chart.theme);

    if (!theme) {
        throw Boom.badRequest('Chart theme does not exist.');
    }

    const [themeFonts, themeData, themeLess] = await Promise.all([
        theme.getMergedAssets(),
        theme.getMergedData(),
        theme.getMergedLess()
    ]);
    theme = theme.toJSON();
    theme.data = themeData;
    theme.fonts = themeFonts;
    theme.less = themeLess;

    /**
     * Load assets like CSS, Javascript and translations
     */
    const [css, { fileName, content }] = await Promise.all([
        compileCSS({ theme, filePaths: [chartCore.less, vis.less] }),
        readFileAndHash(vis.script)
    ]);
    theme.less = ''; /* reset "theme.less" to not inline it twice into the HTML */
    vis.locale = publishData.locales;
    delete publishData.locales;

    /**
     * Collect data for server side rendering with Svelte and Pug
     */
    const props = {
        data: {
            visJSON: vis,
            chartJSON,
            publishData,
            chartData: data,
            isPreview: false,
            chartLocale: locale,
            locales,
            metricPrefix: {} /* NOTE: What about this? */,
            themeId: theme.id,
            fontsJSON: theme.fonts,
            typographyJSON: theme.data.typography,
            polyfillUri: `../../lib/vendor`
        },
        theme,
        translations: vis.locale
    };

    log('rendering');

    const { html, head } = chartCore.svelte.render(props);

    let dependencies = getDependencies({
        locale,
        dependencies: vis.dependencies
    }).map(file => path.join(chartCore.path.dist, file));

    /* Create a temporary directory */
    const outDir = await fs.mkdtemp(path.resolve(os.tmpdir(), `dw-chart-${chart.id}-`));

    /* Copy dependencies into temporary directory and hash them on the way */
    const dependencyPromises = [dependencies, vis.libraries.map(lib => lib.file)]
        .flat()
        .map(filePath => copyFileHashed(filePath, outDir));

    dependencies = (await Promise.all(dependencyPromises)).map(file =>
        path.join('lib/vendor/', file)
    );

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

    props.data.publishData.blocks = publishedBlocks;

    /**
     * Render the visualizations entry: "index.html"
     */
    const indexHTML = renderHTML({
        __DW_SVELTE_PROPS__: stringify(props),
        CHART_LANGUAGE: locale.split(/_|-/)[0],
        META_ROBOTS: 'noindex, nofollow',
        CHART_HTML: html,
        CHART_HEAD: head,
        POLYFILL_SCRIPT: getAssetLink(`../../lib/${polyfillScript}`),
        CORE_SCRIPT: getAssetLink(`../../lib/${coreScript}`),
        CSS: css,
        SCRIPTS: dependencies.map(file => getAssetLink(`../../${file}`)),
        CHART_CLASS: [
            `vis-height-${get(vis, 'height', 'fit')}`,
            `theme-${get(theme, 'id')}`,
            `vis-${get(vis, 'id')}`
        ]
    });

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

    /* write "index.html", visualization Javascript and other assets */
    await fs.writeFile(path.join(outDir, 'index.html'), indexHTML, { encoding: 'utf-8' });
    const fileMap = [
        ...dependencies,
        ...polyfillFiles,
        ...blocksFiles,
        path.join('lib/', polyfillScript),
        path.join('lib/', coreScript),
        'index.html'
    ];

    async function cleanup() {
        await fs.remove(outDir);
    }

    return { data, outDir, fileMap, cleanup };
};

async function loadVendorLocale(vendor, locale) {
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
            return await fs.readFile(file, 'utf-8');
        } catch (e) {
            // file not found, so try next
        }
    }
    // no locale found at all
    return 'null';
}

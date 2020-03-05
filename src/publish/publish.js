const Boom = require('@hapi/boom');
const path = require('path');
const fs = require('fs-extra');
const os = require('os');
const crypto = require('crypto');
const pug = require('pug');
const jsesc = require('jsesc');
const { Chart, ChartPublic } = require('@datawrapper/orm/models');
const { getDependencies } = require('@datawrapper/chart-core/lib/get-dependencies');
const get = require('lodash/get');

function readJSONSync(file) {
    return JSON.parse(fs.readFileSync(file, { encoding: 'utf-8' }));
}

function stringify(obj) {
    return jsesc(obj, {
        isScriptContext: true,
        json: true,
        wrap: true
    });
}

const { compileCSS } = require('./compile-css');

const corePath = path.dirname(require.resolve('@datawrapper/chart-core/package.json'));
const vendorDir = path.join(corePath, '/dist/core');
const localeDir = path.join(vendorDir, '/locale');

const render = pug.compileFile(path.resolve(__dirname, './index.pug'));

const coreManifest = readJSONSync(path.join(vendorDir, 'manifest.json'));
const coreLegacyManifest = readJSONSync(path.join(vendorDir, 'manifest.legacy.json'));

const MAIN_JS = {
    module: coreManifest['main.js'],
    nomodule: coreLegacyManifest['main.legacy.js']
};

async function moveChartAssets({ outDir, chartId, version, server }) {
    const { events, event } = server.app;
    const results = await events.emit(event.PUBLISH_CHART, {
        outDir,
        chart: {
            id: chartId,
            public_version: version
        }
    });

    const successResult = results.find(result => result.status === 'success');
    const errorResult = results.find(result => result.status === 'error');
    /* clean temp directory */
    await fs.remove(outDir);

    if (!successResult || errorResult) {
        throw Boom.badGateway();
    }

    return successResult;
}

async function publishChart(request, h) {
    const { params, auth, server } = request;
    const { visualization } = server.app;
    const { general, frontend } = server.methods.config();
    const { localPluginRoot } = general;

    const SUPPORTED_TYPES = Array.from(visualization);

    const { result: chart } = await server.inject({
        url: `/v3/charts/${params.id}?withData=true`,
        auth
    });

    if (chart.error) {
        return Boom.notFound();
    }

    const csv = chart.data.chart;
    if (!csv) {
        return Boom.conflict('No chart data available.');
    }

    if (!SUPPORTED_TYPES.includes(chart.type)) {
        return Boom.notImplemented(
            `"${chart.type}" is currently not supported.
Supported types: ${SUPPORTED_TYPES.join(',')}`
        );
    }

    const outDir = await fs.mkdtemp(path.resolve(os.tmpdir(), `dw-chart-${chart.id}-`));

    function copyVendorFile(filePath) {
        const file = filePath.split('/').pop();
        return fs.copyFile(path.join(vendorDir, filePath), path.join(outDir, file));
    }

    const { result: vis } = await server.inject({
        url: `/v3/visualizations/${chart.type}`,
        auth
    });

    const visPluginRoot = path.join(localPluginRoot, vis.__plugin);
    const visSrc = path.join(visPluginRoot, 'static', `${chart.type}.js`);

    const { result: theme } = await server.inject({
        url: `/v3/themes/${chart.theme}?extend=true`,
        auth
    });

    const fonts = Object.entries(theme.assets).reduce((fonts, [key, value]) => {
        if (theme.assets[key].type === 'font') fonts[key] = value;
        return fonts;
    }, {});

    const visLessPath = path.join(visPluginRoot, vis.lessDirectory);

    const filePaths = [
        path.join(corePath, 'lib', 'styles.less'),
        path.join(visLessPath, vis.lessFile)
    ];

    const cssPromise = compileCSS({
        fonts,
        theme,
        filePaths,
        paths: [visLessPath]
    });

    const deps = getDependencies({
        locale: chart.language,
        dependencies: vis.dependencies,
        libraries: vis.libraries
    });

    const filePromises = deps
        .concat(['document-register-element.js', MAIN_JS.module, MAIN_JS.nomodule])
        .map(copyVendorFile);

    const script = await fs.readFile(visSrc, { encoding: 'utf-8' });
    const hash = crypto.createHash('sha256');
    hash.update(script);
    const scriptName = `${chart.type}.${hash.digest('hex').slice(0, 8)}.js`;

    const [css] = await Promise.all([
        cssPromise,
        filePromises,
        fs.writeFile(path.join(outDir, scriptName), script)
    ]);

    // TO DO: get and set chartLocale
    const chartLocale = chart.language;

    if (vis.locale) {
        Object.keys(vis.locale).map(key => {
            vis.locale[key] = vis.locale[key][chartLocale];
        });
    }

    const data = {
        visJSON: vis,
        chartJSON: chart,
        chartData: csv,
        isPreview: false,
        chartLocale,
        locales: {},
        metricPrefix: {},
        themeId: theme.id,
        fontsJSON: fonts,
        typographyJSON: theme.data.typography,
        templateJS: false
    };

    const { minimap, highlight, basemap } = chart.data;

    const __DW_TRANSLATIONS__ = await fs.readFile(
        path.join(localeDir, `${chartLocale.replace('_', '-')}.json`),
        {
            encoding: 'utf-8'
        }
    );

    const dwChartClasses = [
        `vis-height-${get(vis, 'height', 'fit')}`,
        `theme-${get(theme, 'id')}`,
        `vis-${get(vis, 'id')}`
    ];

    const APP = require(path.join(vendorDir, 'Chart_SSR.js'));

    const { html } = APP.render({
        data: data,
        theme: theme,
        translations: __DW_TRANSLATIONS__
    });

    await fs.writeFile(
        path.join(outDir, 'index.html'),
        render({
            SSR: html,
            title: chart.title,
            description: chart.metadata.describe.intro,
            __DW_DATA__: stringify(data),
            __DW_THEME__: stringify(theme),
            __DW_TRANSLATIONS__,
            css: jsesc(css, { isScriptContext: true, minimal: true }),
            js: MAIN_JS,
            deps: deps.map(d => d.split('/').pop()),
            libraries: vis.libraries.map(
                lib => `//${frontend.domain}${vis.__static_path}${lib.local}`
            ),
            scriptName,
            basemap,
            minimap,
            highlight,
            dwChartClasses
        }),
        {
            encoding: 'utf-8'
        }
    );

    /* increment public version */
    const newPublicVersion = chart.publicVersion + 1;

    /* move assets to publish location */
    const dest = await moveChartAssets({
        outDir,
        chartId: chart.id,
        version: newPublicVersion,
        server
    });

    const now = new Date();
    const chartUpdatePromise = Chart.update(
        {
            public_version: newPublicVersion,
            published_at: now,
            public_url: dest.data,
            last_edit_step: 5
        },
        { where: { id: chart.id }, limit: 1 }
    );

    /* create or update chart public table row */
    const chartPublicPromise = ChartPublic.upsert({
        id: chart.id,
        title: chart.title,
        type: chart.type,
        metadata: chart.metadata,
        external_data: chart.external_data,
        first_published_at: chart.public_version ? undefined : now,
        author_id: chart.author_id,
        organization_id: chart.organization_id
    });

    await Promise.all([chartUpdatePromise, chartPublicPromise]);

    request.logger.debug(dest, `Chart [${chart.id}] published`);

    return {
        version: newPublicVersion,
        url: dest.data
    };
}

module.exports = { publishChart };

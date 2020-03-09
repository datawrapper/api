const Boom = require('@hapi/boom');
const path = require('path');
const fs = require('fs-extra');
const os = require('os');
const pug = require('pug');
const { Chart, ChartPublic } = require('@datawrapper/orm/models');
const chartCore = require('@datawrapper/chart-core');
const { getDependencies } = require('@datawrapper/chart-core/lib/get-dependencies');
const get = require('lodash/get');
const { stringify, hashFile } = require('../utils/index.js');

const { compileCSS } = require('./compile-css');
const renderHTML = pug.compileFile(path.resolve(__dirname, './index.pug'));

async function moveChartAssets({ outDir, chartId, version, server }) {
    const { events, event } = server.app;

    let eventError;
    let result;
    try {
        result = await events.emit(
            event.PUBLISH_CHART,
            {
                outDir,
                chart: {
                    id: chartId,
                    public_version: version
                }
            },
            { filter: 'first' }
        );
    } catch (error) {
        server.logger().error(error);
        eventError = error;
    }

    /* clean temp directory */
    await fs.remove(outDir);

    if (eventError) {
        throw Boom.badGateway();
    }

    return result;
}

async function publishChart(request, h) {
    const { params, auth, server } = request;
    const { visualizations } = server.app;

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

    const vis = visualizations.get(chart.type);
    if (!vis) {
        return Boom.notImplemented(`"${chart.type}" is currently not supported.`);
    }

    const { result: theme } = await server.inject({
        url: `/v3/themes/${chart.theme}?extend=true`,
        auth
    });

    const cssPromise = compileCSS({
        theme,
        filePaths: [chartCore.less, vis.less]
    });
    theme.less = '';

    const deps = getDependencies({
        locale: chart.language,
        dependencies: vis.dependencies
    });

    const outDir = await fs.mkdtemp(path.resolve(os.tmpdir(), `dw-chart-${chart.id}-`));

    function copyVendorFile(filePath) {
        const file = filePath.split('/').pop();
        return fs.copyFile(path.join(chartCore.path.vendor, filePath), path.join(outDir, file));
    }

    const filePromises = deps
        .concat([
            'document-register-element.js',
            chartCore.script['main.js'],
            chartCore.script['main.legacy.js']
        ])
        .map(copyVendorFile);

    const { fileName, content } = await hashFile(vis.script);

    const [css] = await Promise.all([
        cssPromise,
        filePromises,
        fs.writeFile(path.join(outDir, fileName), content)
    ]);

    if (vis.locale) {
        Object.entries(vis.locale).map(([key, value]) => {
            vis.locale[key] = value[chart.language];
        });
    }

    const data = {
        visJSON: vis,
        chartJSON: chart,
        chartData: csv,
        isPreview: false,
        chartLocale: chart.language,
        locales: {} /* NOTE: What about this? */,
        metricPrefix: {} /* NOTE: What about this? */,
        themeId: theme.id,
        fontsJSON: theme.fonts,
        typographyJSON: theme.data.typography,
        templateJS: false
    };

    const translations = await fs.readJSON(
        path.join(chartCore.path.locale, `${chart.language.replace('_', '-')}.json`),
        {
            encoding: 'utf-8'
        }
    );

    const props = { data, theme, translations };
    const { html, head } = chartCore.svelte.render(props);

    await fs.writeFile(
        path.join(outDir, 'index.html'),
        renderHTML({
            __DW_SVELTE_PROPS__: stringify(props),
            CHART_HTML: html,
            CHART_HEAD: head,
            CORE_SCRIPT: stringify(chartCore.script),
            CSS: css,
            SCRIPTS: [
                deps.map(d => d.split('/').pop()),
                vis.libraries.map(lib =>
                    /* TODO: local <> cdn switch */
                    lib.cdn.replace('%asset_domain%', 'datawrapper-stg.dwcdn.net')
                ),
                fileName
            ].flat(),
            CHART_CLASS: [
                `vis-height-${get(vis, 'height', 'fit')}`,
                `theme-${get(theme, 'id')}`,
                `vis-${get(vis, 'id')}`
            ]
        }),
        {
            encoding: 'utf-8'
        }
    );

    /* increment public version */
    const newPublicVersion = chart.publicVersion + 1;

    /* move assets to publish location */
    /* TODO: move to publish utilities and consider better API */
    const destination = await moveChartAssets({
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
            public_url: destination,
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

    request.logger.debug({ dest: destination }, `Chart [${chart.id}] published`);

    return {
        version: newPublicVersion,
        url: destination
    };
}

module.exports = { publishChart };

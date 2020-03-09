const Boom = require('@hapi/boom');
const path = require('path');
const process = require('process');
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

async function publishChart(request, h) {
    const startTiming = process.hrtime();
    const { params, auth, server } = request;
    const { events, event, visualizations } = server.app;

    /**
     * Load chart information
     * (including metadata, data, basemaps, etc.)
     */
    const { result: chart } = await server.inject({
        url: `/v3/charts/${params.id}?withData=true`,
        auth
    });

    if (chart.error) {
        return Boom.notFound();
    }

    const csv = chart.data.chart;
    chart.data.chart = undefined;
    if (!csv) {
        return Boom.conflict('No chart data available.');
    }

    /**
     * Load visualization information
     */
    const vis = visualizations.get(chart.type);
    if (!vis) {
        return Boom.notImplemented(`"${chart.type}" is currently not supported.`);
    }

    if (vis.locale) {
        Object.entries(vis.locale).map(([key, value]) => {
            vis.locale[key] = value[chart.language];
        });
    }

    /**
     * Load theme information
     */
    const { result: theme } = await server.inject({
        url: `/v3/themes/${chart.theme}?extend=true`,
        auth
    });

    /**
     * Load assets like CSS, Javascript and translations
     */
    const [css, translations, { fileName, content }] = await Promise.all([
        compileCSS({ theme, filePaths: [chartCore.less, vis.less] }),
        fs.readJSON(path.join(chartCore.path.locale, `${chart.language.replace('_', '-')}.json`)),
        hashFile(vis.script)
    ]);
    theme.less = ''; /* reset "theme.less" to not inline it twice into the HTML */

    /**
     * Collect data for server side rendering with Svelte and Pug
     */
    const props = {
        data: {
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
        },
        theme,
        translations
    };
    const { html, head } = chartCore.svelte.render(props);

    const dependencies = getDependencies({
        locale: chart.language,
        dependencies: vis.dependencies
    });

    /**
     * Render the visualizations entry: "index.html"
     */
    const indexHTML = renderHTML({
        __DW_SVELTE_PROPS__: stringify(props),
        CHART_HTML: html,
        CHART_HEAD: head,
        CORE_SCRIPT: stringify(chartCore.script),
        CSS: css,
        SCRIPTS: [
            dependencies.map(d => d.split('/').pop()),
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
    });

    /**
     * Create a temporary directory and write files to it
     */
    const outDir = await fs.mkdtemp(path.resolve(os.tmpdir(), `dw-chart-${chart.id}-`));

    /* start writing static assets adn global dependencies */
    const filePromises = [
        ...dependencies,
        'document-register-element.js',
        chartCore.script['main.js'],
        chartCore.script['main.legacy.js']
    ].map(filePath =>
        fs.copyFile(
            path.join(chartCore.path.vendor, filePath),
            path.join(outDir, path.basename(filePath))
        )
    );

    /* write "index.html", visualization Javascript and other assets */
    await Promise.all([
        fs.writeFile(path.join(outDir, 'index.html'), indexHTML, { encoding: 'utf-8' }),
        fs.writeFile(path.join(outDir, fileName), content),
        ...filePromises
    ]);

    /**
     * The hard work is done!
     * The only thing left is to move the published chart to it's public directory
     * and update some database entries!
     */

    /* increment public version */
    const newPublicVersion = chart.publicVersion + 1;

    /* move assets to publish location */
    let destination, eventError;
    try {
        destination = await events.emit(
            event.PUBLISH_CHART,
            {
                outDir,
                chart: {
                    id: chart.id,
                    public_version: newPublicVersion
                }
            },
            { filter: 'first' }
        );
    } catch (error) {
        server.logger().error(error);
        eventError = error;
    }

    /**
     * All files were moved and the temporary directory is not needed anymore.
     */
    await fs.remove(outDir);

    if (eventError) {
        throw Boom.badGateway();
    }

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

    const endTiming = process.hrtime(startTiming);

    return {
        version: newPublicVersion,
        url: destination,
        timing: `${endTiming[0]}s ${Math.round(endTiming[1] / 1000000)}ms`
    };
}

module.exports = { publishChart };

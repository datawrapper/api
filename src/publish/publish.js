const Boom = require('@hapi/boom');
const path = require('path');
const process = require('process');
const fs = require('fs-extra');
const os = require('os');
const pug = require('pug');
const { Op } = require('@datawrapper/orm').db;
const { Chart, ChartPublic, ChartAccessToken, Action } = require('@datawrapper/orm/models');
const chartCore = require('@datawrapper/chart-core');
const { getDependencies } = require('@datawrapper/chart-core/lib/get-dependencies');
const get = require('lodash/get');
const set = require('lodash/set');
const { stringify, readFileAndHash, copyFileHashed, prepareChart } = require('../utils/index.js');
const { getScope } = require('../utils/l10n');

const { compileCSS } = require('./compile-css');
const renderHTML = pug.compileFile(path.resolve(__dirname, './index.pug'));

async function publishChart(request, h) {
    const startTiming = process.hrtime();

    const { params, auth, server } = request;
    const { events, event, visualizations } = server.app;
    const user = auth.artifacts;

    const chart = await Chart.findByPk(params.id, { attributes: { include: ['created_at'] } });
    if (!(await chart.isPublishableBy(auth.artifacts))) {
        return Boom.unauthorized();
    }

    const publishStatus = [];
    const publishStatusAction = await request.server.methods.logAction(
        user.id,
        `chart/${params.id}/publish`,
        ''
    );

    async function logPublishStatus(action) {
        publishStatus.push(action);
        return publishStatusAction.update({
            details: publishStatus.join(',')
        });
    }

    /**
     * Load chart information
     * (including metadata, data, basemaps, etc.)
     */
    const { result: publishData } = await server.inject({
        url: `/v3/charts/${params.id}/publish/data`,
        auth
    });

    if (chart.error) {
        return Boom.notFound();
    }

    const csv = publishData.data;
    const chartJSON = publishData.chart;
    delete publishData.data;
    delete publishData.chart;

    if (!csv) {
        await logPublishStatus('error-data');
        return Boom.conflict('No chart data available.');
    }

    /**
     * Load visualization information
     */
    const vis = visualizations.get(chart.type);
    if (!vis) {
        await logPublishStatus('error-vis-not-supported');
        return Boom.notImplemented(`"${chart.type}" is currently not supported.`);
    }

    // load vendor locales needed by visualization
    const locales = {};
    if (vis.dependencies.dayjs) {
        locales.dayjs = await loadVendorLocale('dayjs', chart.language);
    }
    if (vis.dependencies.numeral) {
        locales.numeral = await loadVendorLocale('numeral', chart.language);
    }

    // no need to await this...
    logPublishStatus('preparing');

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
            chartData: csv,
            isPreview: false,
            chartLocale: chart.language,
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

    logPublishStatus('rendering');

    const { html, head } = chartCore.svelte.render(props);

    let dependencies = getDependencies({
        locale: chart.language,
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

    dependencies.push(path.join('lib/vis/', fileName));

    const blocksFilePromises = publishData.blocks
        .filter(block => block.include && block.prefix)
        .map(async ({ prefix, publish, blocks }) => {
            const [js, css] = await Promise.all([
                copyFileHashed(publish.js, outDir, { prefix }),
                copyFileHashed(publish.css, outDir, { prefix })
            ]);
            return {
                source: {
                    js: `../../lib/blocks/${js}`,
                    css: `../../lib/blocks/${css}`
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
        CHART_HTML: html,
        CHART_HEAD: head,
        CORE_SCRIPT: `../../lib/${coreScript}`,
        CSS: css,
        SCRIPTS: dependencies.map(file => `../../${file}`),
        CHART_CLASS: [
            `vis-height-${get(vis, 'height', 'fit')}`,
            `theme-${get(theme, 'id')}`,
            `vis-${get(vis, 'id')}`
        ]
    });

    /* Copy polyfills to destination */
    const polyfillPromises = chartCore.polyfills.map(async filePath => {
        const file = path.basename(filePath);
        await fs.copyFile(filePath, path.join(outDir, file));
        return path.join('lib/vendor/', file);
    });

    const polyfillFiles = await Promise.all(polyfillPromises);

    /* write "index.html", visualization Javascript and other assets */
    await fs.writeFile(path.join(outDir, 'index.html'), indexHTML, { encoding: 'utf-8' });
    const fileMap = [
        ...dependencies,
        ...polyfillFiles,
        ...blocksFiles,
        path.join('lib/', coreScript),
        'index.html'
    ];

    /* write public CSV file (used when forking a chart) */
    await events.emit(event.PUT_CHART_ASSET, {
        chart,
        data: csv,
        filename: `${chart.id}.public.csv`
    });

    /**
     * The hard work is done!
     * The only thing left is to move the published chart to it's public directory
     * and update some database entries!
     */

    /* increment public version */
    const newPublicVersion = chart.public_version + 1;

    logPublishStatus('uploading');

    /* move assets to publish location */
    let destination, eventError;

    try {
        destination = await events.emit(
            event.PUBLISH_CHART,
            {
                outDir,
                fileMap,
                chart,
                user,
                newPublicVersion
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

    /* we need to update chart here to get the correct public_url
       in out embed codes */
    await chart.update({
        public_version: newPublicVersion,
        published_at: now,
        public_url: destination,
        last_edit_step: 5
    });

    /* store new embed codes in chart metadata */
    const embedCodes = {};
    const res = await request.server.inject({
        url: `/v3/charts/${params.id}/embed-codes`,
        auth
    });
    res.result.forEach(embed => {
        embedCodes[`embed-method-${embed.id}`] = embed.code;
    });
    set(chart, 'metadata.publish.embed-codes', embedCodes);

    const chartUpdatePromise = Chart.update(
        {
            metadata: chart.metadata
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

    // log action that chart has been published
    await request.server.methods.logAction(user.id, `chart/publish`, chart.id);

    await publishStatusAction.destroy();

    await server.app.events.emit(server.app.event.CHART_PUBLISHED, { chart, user });

    return {
        version: newPublicVersion,
        url: destination,
        timing: `${endTiming[0]}s ${Math.round(endTiming[1] / 1000000)}ms`
    };
}

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

async function publishChartStatus(request, h) {
    const { params, auth } = request;

    const chart = await Chart.findByPk(params.id);

    if (!(await chart.isEditableBy(auth.artifacts, auth.credentials.session))) {
        return Boom.unauthorized();
    }

    const publishAction = await Action.findOne({
        where: {
            key: `chart/${chart.id}/publish`
        },
        order: [['id', 'DESC']]
    });

    if (!publishAction) return Boom.notFound();

    return {
        progress: publishAction.details.split(',')
    };
}

async function publishData(request, h) {
    const { query, params, server, auth } = request;

    const chartQuery = query.published
        ? ChartPublic.findOne({
              where: { id: params.id }
          })
        : Chart.findOne({
              where: { id: params.id, deleted: { [Op.not]: true } },
              attributes: { exclude: ['deleted', 'deleted_at', 'utf8'] }
          });

    const chart = await chartQuery;

    let hasAccess =
        query.published || (await chart.isEditableBy(auth.artifacts, auth.credentials.session));
    if (!hasAccess && query.ott) {
        const count = await ChartAccessToken.destroy({
            where: {
                chart_id: params.id,
                token: query.ott
            },
            limit: 1
        });

        hasAccess = !!count;
    }

    if (!hasAccess) {
        return Boom.unauthorized();
    }

    // the csv dataset
    const res = await request.server.inject({
        url: `/v3/charts/${params.id}/data`,
        auth
    });

    const additionalData = await getAdditionalMetadata(chart, { server });

    const data = { data: res.result, chart: prepareChart(chart, additionalData) };

    const htmlResults = await server.app.events.emit(
        server.app.event.CHART_AFTER_BODY_HTML,
        {
            chart,
            data
        },
        { filter: 'success' }
    );
    data.chartAfterBodyHTML = htmlResults.join('\n');

    // chart locales
    data.locales = getScope('chart', chart.language);

    await server.app.events.emit(server.app.event.CHART_PUBLISH_DATA, {
        chart,
        auth,
        data
    });

    const chartBlocks = await server.app.events.emit(
        server.app.event.CHART_BLOCKS,
        {
            chart,
            user: auth.artifacts,
            data
        },
        { filter: 'success' }
    );
    data.blocks = chartBlocks.filter(d => d);

    return data;
}

async function getAdditionalMetadata(chart, { server }) {
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

    if (chart.forked_from) {
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
                        chartId: chart.id
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
}

module.exports = { publishChart, publishChartStatus, publishData, getAdditionalMetadata };

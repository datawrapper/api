const Boom = require('@hapi/boom');
const { Op } = require('@datawrapper/orm').db;
const { User, Chart, ChartPublic, ChartAccessToken, Action } = require('@datawrapper/orm/models');
const get = require('lodash/get');
const set = require('lodash/set');
const { prepareChart } = require('../utils/index.js');
const { getScope } = require('../utils/l10n');

async function publishChart(request, h) {
    const { params, auth, server } = request;
    const { events, event } = server.app;
    const { createChartWebsite } = server.methods;
    const user = auth.artifacts;
    const chart = await Chart.findByPk(params.id, { attributes: { include: ['created_at'] } });
    if (!chart || !(await chart.isPublishableBy(user))) {
        throw Boom.unauthorized();
    }

    const publishStatus = [];
    const publishStatusAction = await server.methods.logAction(
        user.id,
        `chart/${params.id}/publish/${chart.public_version}`,
        ''
    );

    async function logPublishStatus(action) {
        publishStatus.push(action);
        return publishStatusAction.update({
            details: publishStatus.join(',')
        });
    }

    const options = { auth, server, log: logPublishStatus };
    const { data, outDir, fileMap, cleanup } = await createChartWebsite(chart, options);

    /**
     * The hard work is done!
     * The only thing left is to move the published chart to it's public directory
     * and update some database entries!
     */

    /* write public CSV file (used when forking a chart) */
    await events.emit(event.PUT_CHART_ASSET, {
        chart,
        data,
        filename: `${chart.id}.public.csv`
    });

    /* increment public version */
    const newPublicVersion = chart.public_version + 1;

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
                newPublicVersion,
                log: logPublishStatus
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
    await cleanup();

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

    // log action that chart has been published
    await request.server.methods.logAction(user.id, `chart/publish`, chart.id);

    await server.app.events.emit(server.app.event.CHART_PUBLISHED, {
        chart,
        user,
        log: logPublishStatus
    });

    logPublishStatus('done');

    return {
        version: newPublicVersion,
        url: destination
    };
}

async function publishChartStatus(request, h) {
    const { params, auth } = request;

    const chart = await Chart.findByPk(params.id);
    if (!(await chart.isEditableBy(auth.artifacts, auth.credentials.session))) {
        return Boom.unauthorized();
    }

    const publishAction = await Action.findOne({
        where: {
            key: `chart/${chart.id}/publish/${params.version}`
        },
        order: [['id', 'DESC']]
    });

    if (!publishAction) throw Boom.notFound();

    return {
        progress: publishAction.details.split(',')
    };
}

async function publishData(request, h) {
    const { query, params, server, auth } = request;

    const chart = await (query.published
        ? ChartPublic.findOne({
              where: { id: params.id }
          })
        : Chart.findOne({
              where: { id: params.id, deleted: { [Op.not]: true } },
              attributes: { exclude: ['deleted', 'deleted_at', 'utf8'] }
          }));

    if (!chart) throw Boom.notFound();

    let user = auth.artifacts;

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

        if (hasAccess && chart.author_id) {
            user = await User.findByPk(chart.author_id);
        }
    }

    if (!hasAccess) {
        throw Boom.unauthorized();
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
    data.locales = getScope('chart', chart.language || 'en-US');

    await server.app.events.emit(server.app.event.CHART_PUBLISH_DATA, {
        chart,
        auth,
        data
    });

    const chartBlocks = await server.app.events.emit(
        server.app.event.CHART_BLOCKS,
        {
            chart,
            user,
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

    if (chart.forked_from && chart.is_fork) {
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

const Joi = require('@hapi/joi');
const Boom = require('@hapi/boom');
const { noContentResponse } = require('../../../schemas/response');
const checkUrl = require('@datawrapper/service-utils/checkUrl');
const got = require('got');
const get = require('lodash/get');

module.exports = (server, options) => {
    const { events, event } = server.app;

    // GET /v3/charts/{id}/data
    server.route({
        method: 'GET',
        path: '/data',
        options: {
            tags: ['api'],
            description: 'Fetch chart data',
            notes: `Request the data of a chart, which is usually a CSV. Requires scope \`chart:read\`.`,
            auth: {
                access: { scope: ['chart:read'] }
            },
            plugins: {
                'hapi-swagger': {
                    produces: ['text/csv', 'application/json']
                }
            },
            validate: {
                params: Joi.object({
                    id: Joi.string().length(5).required()
                })
            }
        },
        handler: getChartData
    });

    // PUT /v3/charts/{id}/data
    server.route({
        method: 'PUT',
        path: '/data',
        options: {
            tags: ['api'],
            description: 'Upload chart data',
            notes: `Upload data for a chart or map. Requires scope \`chart:write\`.`,
            auth: {
                access: { scope: ['chart:write'] }
            },
            plugins: {
                'hapi-swagger': {
                    consumes: ['text/csv', 'application/json']
                }
            },
            validate: {
                params: Joi.object({
                    id: Joi.string().length(5).required()
                }),
                payload: [
                    Joi.string().description(
                        'An asset used by the chart such as CSV data or custom JSON map.'
                    ),
                    Joi.object()
                ]
            },
            response: noContentResponse,
            payload: {
                maxBytes: 2048 * 1024, // 2MiB
                defaultContentType: 'text/csv',
                allow: ['text/csv', 'application/json']
            }
        },
        handler: writeChartData
    });

    // POST /v3/charts/{id}/data/refresh
    server.route({
        method: 'POST',
        path: '/data/refresh',
        options: {
            tags: ['api'],
            description: "Updates a chart's external data source.",
            notes: `If a chart has an external data source configured, this endpoint fetches the data and saves it to the chart. Requires scope \`chart:write\`.`,
            auth: {
                access: { scope: ['chart:write'] }
            },
            validate: {
                params: Joi.object({
                    id: Joi.string().length(5).required()
                })
            }
        },
        handler: async (request, h) => {
            const { params, auth } = request;

            const chart = await server.methods.loadChart(params.id);

            if (!chart) {
                return Boom.notFound();
            }

            const isEditable = await chart.isEditableBy(auth.artifacts, auth.credentials.session);

            if (!isEditable) {
                return Boom.notFound();
            }

            if (chart.external_data && checkUrl(chart.external_data)) {
                try {
                    const data = (await got(chart.external_data)).body;

                    await events.emit(event.PUT_CHART_ASSET, {
                        chart,
                        data,
                        filename: `${chart.id}.csv`
                    });

                    chart.changed('last_modified_at', true);
                    await chart.save();
                } catch (ex) {}

                if (
                    get(chart, 'metadata.data.upload-method') === 'external-data' &&
                    get(chart, 'metadata.data.external-metadata')
                ) {
                    try {
                        const metadataUrl = get(chart, 'metadata.data.external-metadata');

                        if (checkUrl(metadataUrl)) {
                            const metadata = (await got(metadataUrl)).body;

                            try {
                                JSON.parse(metadata);

                                // @todo: validate against metadata schema
                                await events.emit(event.PUT_CHART_ASSET, {
                                    chart,
                                    data: metadata,
                                    filename: `${chart.id}.metadata.json`
                                });
                            } catch (ex) {}
                        }
                    } catch (ex) {}
                }
            }

            await events.emit(event.CUSTOM_EXTERNAL_DATA, { chart });

            return h.response().code(204);
        }
    });
};

async function getChartData(request, h) {
    const { params, query } = request;

    let filename = `${params.id}.${query.published ? 'public.' : ''}csv`;

    const res = await request.server.inject({
        method: 'GET',
        url: `/v3/charts/${params.id}/assets/${filename}${query.ott ? `?ott=${query.ott}` : ''}`,
        auth: request.auth
    });

    if (res.result.error) {
        return new Boom.Boom(res.result.message, res.result);
    }

    let contentType = 'text/csv';

    try {
        const tmp = JSON.parse(res.result);
        if (typeof tmp !== 'string') {
            contentType = 'application/json';
            filename = `${params.id}.json`;
        }
    } catch (error) {}

    return h
        .response(res.result)
        .header('Content-Type', contentType)
        .header('Content-Disposition', filename);
}

async function writeChartData(request, h) {
    const { params } = request;

    const res = await request.server.inject({
        method: 'PUT',
        url: `/v3/charts/${params.id}/assets/${params.id}.csv`,
        auth: request.auth,
        headers: request.headers,
        payload: request.payload
    });

    return h.response(res.result).code(res.statusCode);
}

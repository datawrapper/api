const Joi = require('@hapi/joi');
const Boom = require('@hapi/boom');
const { Chart } = require('@datawrapper/orm/models');
const { noContentResponse } = require('../../../schemas/response');
const checkUrl = require('@datawrapper/shared/node/checkUrl');
const got = require('got');

module.exports = (server, options) => {
    // GET /v3/charts/{id}/data
    server.route({
        method: 'GET',
        path: '/data',
        options: {
            tags: ['api'],
            description: 'Fetch chart data',
            notes: `Request the data of a chart, which is usually a CSV.`,
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
                    id: Joi.string()
                        .length(5)
                        .required()
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
            notes: `Upload data for a chart or map.`,
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
                    id: Joi.string()
                        .length(5)
                        .required()
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
            notes: `If a chart has an external data source configured, this endpoint fetches the data and saves it to the chart.`,
            auth: {
                access: { scope: ['chart:write'] }
            },
            validate: {
                params: Joi.object({
                    id: Joi.string()
                        .length(5)
                        .required()
                })
            }
        },
        handler: async (request, h) => {
            const { params, server, auth } = request;
            const { events, event } = server;

            const chart = await Chart.findByPk(params.chartId);

            if (!chart) {
                return Boom.notFound();
            }

            const isEditable = await chart.isEditableBy(auth.artifacts, auth.credentials.session);

            if (!isEditable) {
                return Boom.notFound();
            }

            if (chart.external_data && checkUrl(chart.external_data)) {
                const data = await got(chart.external_data).body;

                await events.emit(event.PUT_CHART_ASSET, {
                    chart,
                    data,
                    filename: `${chart.id}.csv`
                });
            }

            await events.emit(event.CUSTOM_EXTERNAL_DATA, {
                chart
            });

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
        payload: request.payload
    });

    return h.response(res.result).code(res.statusCode);
}

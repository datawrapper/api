const Joi = require('joi');
const Boom = require('boom');
const { Op } = require('sequelize');
const { camelizeKeys } = require('humps');
const nanoid = require('nanoid');
const set = require('lodash/set');
const { Chart } = require('@datawrapper/orm/models');

module.exports = {
    name: 'chart-routes',
    version: '1.0.0',
    register: (server, options) => {
        server.route({
            method: 'GET',
            path: '/',
            options: {
                tags: ['api'],
                validate: {
                    query: Joi.object().keys({
                        metadataFormat: Joi.string()
                            .valid(['json', 'string'])
                            .default('json'),
                        userId: Joi.any()
                    })
                }
            },
            handler: getAllCharts
        });

        server.route({
            method: 'GET',
            path: '/{id}',
            options: {
                tags: ['api'],
                validate: {
                    query: Joi.object().keys({
                        metadataFormat: Joi.string()
                            .valid(['json', 'string'])
                            .default('json')
                    }),
                    params: Joi.object().keys({
                        id: Joi.string()
                            .length(5)
                            .required()
                    })
                }
            },
            handler: getChart
        });

        server.route({
            method: 'POST',
            path: '/',
            options: {
                tags: ['api'],
                validate: {
                    payload: Joi.object().keys({
                        title: Joi.string()
                    })
                }
            },
            handler: createChart
        });

        server.route({
            method: 'POST',
            path: '/{id}/export/{format}',
            options: {
                tags: ['api'],
                validate: {
                    params: Joi.object().keys({
                        id: Joi.string()
                            .length(5)
                            .required(),
                        format: Joi.string().required()
                    }),
                    payload: Joi.object().keys({
                        unit: Joi.string().default('px'),
                        mode: Joi.string().default('rgb'),
                        width: Joi.number().default(600),
                        height: Joi.any(),
                        plain: Joi.boolean().default(false),
                        scale: Joi.number().default(1),
                        border: Joi.object().keys({
                            width: Joi.number(),
                            color: Joi.string().default('#ffffff')
                        })
                    })
                }
            },
            handler: exportChart
        });

        server.route({
            method: 'GET',
            path: '/{id}/export/{format}',
            options: {
                tags: ['api'],
                validate: {
                    params: Joi.object().keys({
                        id: Joi.string()
                            .length(5)
                            .required(),
                        format: Joi.string().required()
                    }),
                    query: Joi.object().keys({
                        unit: Joi.string().default('px'),
                        mode: Joi.string().default('rgb'),
                        width: Joi.number().default(600),
                        height: Joi.any(),
                        plain: Joi.boolean().default(false),
                        scale: Joi.number().default(1)
                    })
                }
            },
            /* needs Purpose header */
            handler: async (request, h) =>
                exportChart({ ...request, payload: request.params }, h, Boom)
        });
    }
};

function prepareChart(chart, { metadataFormat } = {}) {
    chart = camelizeKeys(chart.dataValues);
    if (metadataFormat === 'json' && typeof chart.metadata === 'string') {
        chart.metadata = JSON.parse(chart.metadata);
    }

    if (metadataFormat === 'string' && typeof chart.metadata === 'object') {
        chart.metadata = JSON.stringify(chart.metadata);
    }

    return chart;
}

async function findChartId() {
    const id = nanoid(5);
    return (await Chart.findByPk(id)) ? findChartId() : id;
}

async function getAllCharts(request, h) {
    const { query, url } = request;

    let options = {
        attributes: ['id', 'title', 'type', 'created_at', 'last_modified_at']
    };

    if (query.userId === 'me') {
        set(options, ['where', 'author_id'], request.auth.artifacts.id);
    } else {
        set(options, ['where', 'published_at', Op.ne], null);
    }

    const { count, rows } = await Chart.findAndCountAll(options);

    const charts = rows.map(chart => ({
        ...prepareChart(chart, { metadataFormat: query.metadataFormat }),
        url: `${url.origin}${url.pathname}/${chart.id}`
    }));

    return {
        list: charts,
        total: count
    };
}

async function getChart(request, h) {
    const { query, url, params, auth } = request;
    const chart = await Chart.findByPk(params.id);

    if (chart.author_id !== auth.artifacts.id && !chart.published_at) {
        request.server.methods.isAdmin(request, { throwError: true });
    }

    return {
        ...prepareChart(chart, { metadataFormat: query.metadataFormat }),
        url: `${url.origin}${url.pathname}`
    };
}

async function createChart(request, h) {
    const id = await findChartId();
    let chart;

    chart = await Chart.create({
        theme: 'default',
        type: 'd3-bars',
        metadata: { data: {} },
        language: request.auth.artifacts.language,
        ...request.payload,
        author_id: request.auth.artifacts.id,
        id
    });

    return h.response(prepareChart(chart)).code(201);
}

async function exportChart(request, h) {
    if (request.server.methods.chartExport) {
        return request.server.methods.chartExport(request, h, Boom);
    } else {
        return Boom.badImplementation();
    }
}

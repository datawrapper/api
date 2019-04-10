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
            method: 'DELETE',
            path: '/{id}',
            options: {
                tags: ['api'],
                validate: {
                    params: Joi.object().keys({
                        id: Joi.string()
                            .length(5)
                            .required()
                    })
                }
            },
            handler: deleteChart
        });

        server.route({
            method: 'GET',
            path: '/{id}/data',
            options: {
                tags: ['api'],
                validate: {
                    params: Joi.object().keys({
                        id: Joi.string()
                            .length(5)
                            .required()
                    })
                }
            },
            handler: () => Boom.notImplemented()
        });

        server.route({
            method: 'POST',
            path: '/',
            options: {
                tags: ['api'],
                validate: {
                    payload: Joi.object({
                        title: Joi.string()
                    }).allow(null)
                }
            },
            handler: createChart
        });

        if (server.methods.chartExport) {
            server.route({
                method: 'POST',
                path: '/{id}/export/{format}',
                options: {
                    description: 'It is recommended to use GET /charts/{id}/export/{format}',
                    plugins: {
                        'hapi-swagger': {
                            deprecated: true
                        }
                    },
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
                            scale: Joi.number().default(1),
                            borderWidth: Joi.number(),
                            borderColor: Joi.string()
                        })
                    }
                },
                handler: handleChartExport
            });
        }
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
        where: { deleted: { [Op.not]: true } },
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
        url: `${url.pathname}/${chart.id}`
    }));

    return {
        list: charts,
        total: count
    };
}

async function getChart(request, h) {
    const { query, url, params, auth } = request;
    const chart = await Chart.findOne({
        where: {
            id: params.id,
            deleted: { [Op.not]: true }
        },
        attributes: {
            exclude: ['guest_session']
        }
    });

    if (!chart) {
        return Boom.notFound();
    }

    if (chart.author_id !== auth.artifacts.id && !chart.published_at) {
        request.server.methods.isAdmin(request, { throwError: true });
    }

    return {
        ...prepareChart(chart, { metadataFormat: query.metadataFormat }),
        url: `${url.pathname}`
    };
}

async function createChart(request, h) {
    const { url } = request;

    const id = await findChartId();
    const chart = await Chart.create({
        title: '',
        theme: 'default',
        type: 'd3-bars',
        metadata: { data: {} },
        language: request.auth.artifacts.language,
        ...request.payload,
        author_id: request.auth.artifacts.id,
        id
    });

    return h.response({ ...prepareChart(chart), url: `${url.pathname}/${chart.id}` }).code(201);
}

async function exportChart(request, h) {
    const { chartExport } = request.server.methods;
    const { payload, params, auth, logger } = request;

    Object.assign(payload, params);
    try {
        const { stream, type } = await chartExport(payload, auth.artifacts.id, logger, Boom);
        return h.response(stream).header('Content-Type', type);
    } catch (error) {
        return Boom[error.message]();
    }
}

async function handleChartExport(request, h) {
    const { borderWidth, borderColor, ...query } = request.query;
    let border;

    if (borderWidth || borderColor) {
        border = {
            width: borderWidth,
            color: borderColor
        };
    }

    request.payload = Object.assign(query, border);

    return exportChart(request, h);
}

async function deleteChart(request, h) {
    const options = {
        where: {
            id: request.params.id,
            deleted: {
                [Op.not]: true
            }
        }
    };

    if (!request.server.methods.isAdmin(request)) {
        set(options, ['where', 'author_id'], request.auth.artifacts.id);
    }

    const chart = await Chart.findOne(options);

    if (!chart) return Boom.forbidden();

    await chart.update({
        deleted: true,
        deleted_at: new Date()
    });

    return h.response().code(204);
}

const Joi = require('@hapi/joi');
const Boom = require('@hapi/boom');
const { Op } = require('sequelize');
const { camelizeKeys, decamelizeKeys, decamelize } = require('humps');
const nanoid = require('nanoid');
const set = require('lodash/set');
const assign = require('assign-deep');
const { Chart, ChartPublic } = require('@datawrapper/orm/models');

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
                            .default('json')
                            .description('Deprecated'),
                        userId: Joi.any().description('ID of the user to fetch charts for.'),
                        search: Joi.string().description(
                            'Search for charts with a specific title.'
                        ),
                        order: Joi.string()
                            .uppercase()
                            .valid(['ASC', 'DESC'])
                            .default('ASC')
                            .description('Result order (ascending or descending)'),
                        orderBy: Joi.string()
                            .valid(['id', 'email', 'name', 'createdAt'])
                            .default('id')
                            .description('Attribute to order by'),
                        limit: Joi.number()
                            .integer()
                            .default(100)
                            .description('Maximum items to fetch. Useful for pagination.'),
                        offset: Joi.number()
                            .integer()
                            .default(0)
                            .description('Number of items to skip. Useful for pagination.')
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
                            .description('Deprecated')
                    }),
                    params: Joi.object().keys({
                        id: Joi.string()
                            .length(5)
                            .required()
                            .description('5 character long chart ID.')
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
                            .description('5 character long chart ID.')
                    })
                }
            },
            handler: deleteChart
        });

        server.route({
            method: 'PATCH',
            path: '/{id}',
            options: {
                tags: ['api'],
                validate: {
                    params: Joi.object().keys({
                        id: Joi.string()
                            .length(5)
                            .required()
                            .description('5 character long chart ID.')
                    }),
                    payload: Joi.object({
                        title: Joi.string()
                            .example('My cool chart')
                            .description('Title of your chart. This will be the chart headline.'),
                        theme: Joi.string()
                            .example('datawrapper')
                            .description('Chart theme to use.'),
                        type: Joi.string()
                            .example('d3-lines')
                            .description(
                                'Type of the chart, like line chart, bar chart, ... Type keys can be found [here].'
                            ),
                        lastEditStep: Joi.number()
                            .integer()
                            .example(1)
                            .description(
                                'Used in the app to determine where the user last edited the chart.'
                            ),
                        language: Joi.string().description('Chart language.'),
                        metadata: Joi.object({
                            data: Joi.object({
                                transpose: Joi.boolean()
                            }).unknown(true)
                        })
                            .description(
                                'Metadata that saves all chart specific settings and options.'
                            )
                            .unknown(true)
                    })
                }
            },
            handler: editChart
        });

        server.route({
            method: 'POST',
            path: '/',
            options: {
                tags: ['api'],
                validate: {
                    payload: Joi.object({
                        title: Joi.string()
                            .example('My cool chart')
                            .description('Title of your chart. This will be the chart headline.'),
                        theme: Joi.string()
                            .example('datawrapper')
                            .description('Chart theme to use.'),
                        type: Joi.string()
                            .example('d3-lines')
                            .description(
                                'Type of the chart, like line chart, bar chart, ... Type keys can be found [here].'
                            ),
                        metadata: Joi.object({
                            data: Joi.object({
                                transpose: Joi.boolean()
                            }).unknown(true)
                        })
                            .description(
                                'Metadata that saves all chart specific settings and options.'
                            )
                            .unknown(true)
                    })
                        .unknown(true)
                        .allow(null)
                }
            },
            handler: createChart
        });

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
                            .required()
                            .description('5 character long chart ID.'),
                        format: Joi.string()
                            .required()
                            .description('Export format (PDF, PNG, SVG)')
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
                            .required()
                            .description('5 character long chart ID.'),
                        format: Joi.string()
                            .required()
                            .description('Export format (pdf, png, svg)')
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

            handler: getChartData
        });

        server.route({
            method: 'PUT',
            path: '/{id}/data',
            options: {
                tags: ['api'],
                validate: {
                    params: Joi.object().keys({
                        id: Joi.string()
                            .length(5)
                            .required()
                    }),
                    payload: Joi.string().description('CSV data to visualize in the chart.')
                }
            },
            handler: writeChartData
        });
    }
};

function prepareChart(chart, { metadataFormat } = {}) {
    chart = {
        ...camelizeKeys(chart.dataValues),
        metadata: chart.dataValues.metadata
    };
    if (metadataFormat === 'json' && typeof chart.metadata === 'string') {
        chart.metadata = JSON.parse(chart.metadata);
    }

    if (metadataFormat === 'string' && typeof chart.metadata === 'object') {
        chart.metadata = JSON.stringify(chart.metadata);
    }

    chart.guestSession = undefined;

    return chart;
}

async function findChartId() {
    const id = nanoid(5);
    return (await Chart.findByPk(id)) ? findChartId() : id;
}

async function getAllCharts(request, h) {
    const { query, url, auth } = request;

    const options = {
        order: [[decamelize(query.orderBy), query.order]],
        attributes: ['id', 'title', 'type', 'created_at', 'last_modified_at'],
        where: {
            deleted: {
                [Op.not]: true
            }
        },
        limit: query.limit,
        offset: query.offset
    };

    if (query.search) {
        set(options, ['where', 'title', Op.like], `%${query.search}%`);
    }

    let model = Chart;

    if (query.userId === 'me') {
        if (auth.artifacts.role === 'guest') {
            set(options, ['where', 'guest_session'], auth.credentials.session);
        } else {
            set(options, ['where', 'author_id'], auth.artifacts.id);
        }
    } else {
        model = ChartPublic;
        set(options, ['where'], undefined);
        set(options, ['attributes'], ['id', 'title', 'type']);
    }

    const { count, rows } = await model.findAndCountAll(options);

    const charts = rows.map(chart => ({
        ...prepareChart(chart, { metadataFormat: query.metadataFormat }),
        url: `${url.pathname}/${chart.id}`
    }));

    const chartList = {
        list: charts,
        total: count
    };

    if (query.limit + query.offset < count) {
        const nextParams = new URLSearchParams({
            ...query,
            offset: query.limit + query.offset,
            limit: query.limit
        });

        set(chartList, 'next', `${url.pathname}?${nextParams.toString()}`);
    }

    return chartList;
}

async function getChart(request, h) {
    const { query, url, params, auth } = request;

    let chart = await Chart.findOne({
        where: {
            id: params.id,
            deleted: { [Op.not]: true }
        }
    });

    if (!chart) {
        return Boom.notFound();
    }

    const isGuestChart = chart.guest_session === auth.credentials.session;

    const isEditable =
        isGuestChart || (await chart.isEditableBy(auth.artifacts, auth.credentials.session));

    if (!isEditable) {
        if (chart.published_at) {
            chart = await ChartPublic.findOne({
                where: {
                    id: params.id
                }
            });
        } else {
            return Boom.unauthorized();
        }
    }

    return {
        ...prepareChart(chart, { metadataFormat: query.metadataFormat }),
        url: `${url.pathname}`
    };
}

async function createChart(request, h) {
    const { url, auth } = request;

    const id = await findChartId();
    const chart = await Chart.create({
        title: '',
        theme: 'default',
        type: 'd3-bars',
        language: auth.artifacts.language,
        ...decamelizeKeys(request.payload),
        metadata: request.payload ? request.payload.metadata : { data: {} },
        author_id: auth.artifacts.id,
        guest_session: auth.artifacts.role === 'guest' ? auth.credentials.session : undefined,
        id
    });

    return h.response({ ...prepareChart(chart), url: `${url.pathname}/${chart.id}` }).code(201);
}

async function editChart(request, h) {
    const { params, payload, auth, url } = request;

    let chart = await Chart.findOne({
        where: {
            id: params.id,
            deleted: { [Op.not]: true }
        }
    });

    if (!chart) {
        return Boom.notFound();
    }

    const isGuestChart = chart.guest_session === auth.credentials.session;

    const isEditable =
        isGuestChart || (await chart.isEditableBy(auth.artifacts, auth.credentials.session));

    if (!isEditable) {
        return Boom.unauthorized();
    }

    const newData = assign(prepareChart(chart, { metadataFormat: 'json' }), payload);

    chart = await chart.update({ ...decamelizeKeys(newData), metadata: newData.metadata });

    return {
        ...prepareChart(chart, { metadataFormat: 'json' }),
        url: `${url.pathname}`
    };
}

async function exportChart(request, h) {
    const { payload, params, auth, logger, server } = request;
    const { events, event } = server.app;

    if (auth.artifacts.role === 'guest') return Boom.forbidden();

    Object.assign(payload, params);
    try {
        const results = await events.emit(event.CHART_EXPORT, {
            data: payload,
            userId: auth.artifacts.id,
            logger
        });

        const successfulResult = results.find(res => res.status === 'success');

        if (!successfulResult) {
            const { error } = results.find(res => res.status === 'error') || {
                error: new Error('notImplemented')
            };
            throw error;
        }

        const { stream, type } = successfulResult.data;
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
    const { auth, server, params } = request;
    const options = {
        where: {
            id: params.id,
            deleted: {
                [Op.not]: true
            }
        }
    };

    if (!server.methods.isAdmin(request)) {
        if (auth.artifacts.role === 'guest') {
            set(options, ['where', 'guest_session'], auth.credentials.session);
        } else {
            set(options, ['where', 'author_id'], auth.artifacts.id);
        }
    }

    const chart = await Chart.findOne(options);

    if (!chart) return Boom.forbidden();

    await chart.update({
        deleted: true,
        deleted_at: new Date()
    });

    return h.response().code(204);
}

async function loadChart(request) {
    const { id } = request.params;

    const chart = await Chart.findByPk(id, {
        attributes: ['id', 'author_id', 'created_at', 'guest_session']
    });

    if (!chart) {
        throw Boom.notFound();
    }

    return chart;
}

async function getChartData(request, h) {
    const { events, event } = request.server.app;
    const chart = await loadChart(request);

    const filename = `${chart.id}.csv`;

    try {
        const eventResults = await events.emit(event.GET_CHART_DATA, { chart, filename });
        const data = eventResults.find(e => e.status === 'success').data;

        return h
            .response(data)
            .header('Content-Type', 'text/csv')
            .header('Content-Disposition', `attachment; filename=${filename}`);
    } catch (error) {
        request.logger.error(error.message);
        return Boom.notFound();
    }
}

async function writeChartData(request, h) {
    const { events, event } = request.server.app;
    const chart = await loadChart(request);

    const isGuestChart = chart.guest_session === request.auth.credentials.session;
    const isEditable = isGuestChart || (await chart.isEditableBy(request.auth.artifacts));

    if (!isEditable) {
        return Boom.forbidden();
    }

    const filename = `${chart.id}.csv`;

    try {
        const eventResults = await events.emit(event.PUT_CHART_DATA, {
            chart,
            data: request.payload,
            filename
        });

        const { code } = eventResults.find(e => e.status === 'success').data;

        return h.response().code(code);
    } catch (error) {
        request.logger.error(error.message);
        return Boom.notFound();
    }
}

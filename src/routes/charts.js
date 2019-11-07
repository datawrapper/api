const Joi = require('@hapi/joi');
const Boom = require('@hapi/boom');
const { Op } = require('sequelize');
const { camelizeKeys, decamelizeKeys, decamelize } = require('humps');
const nanoid = require('nanoid');
const set = require('lodash/set');
const assign = require('assign-deep');
const { Chart, ChartPublic, User, Folder } = require('@datawrapper/orm/models');
const CodedError = require('@datawrapper/shared/CodedError');

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
                    query: Joi.object({
                        userId: Joi.any().description('ID of the user to fetch charts for.'),
                        published: Joi.boolean().description(
                            'Flag to filter results by publish status'
                        ),
                        search: Joi.string().description(
                            'Search for charts with a specific title.'
                        ),
                        order: Joi.string()
                            .uppercase()
                            .valid(['ASC', 'DESC'])
                            .default('DESC')
                            .description('Result order (ascending or descending)'),
                        orderBy: Joi.string()
                            .valid(['id', 'email', 'name', 'createdAt'])
                            .default('createdAt')
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
                    params: Joi.object({
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
                    params: Joi.object({
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
                    params: Joi.object({
                        id: Joi.string()
                            .length(5)
                            .required()
                            .description('5 character long chart ID.')
                    }),
                    payload: Joi.object({
                        title: Joi.string()
                            .example('My cool chart')
                            .allow('')
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
                        folderId: Joi.number()
                            .allow(null)
                            .optional(),
                        organizationId: Joi.string()
                            .allow(null)
                            .optional(),
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
                validate: {
                    params: Joi.object({
                        id: Joi.string()
                            .length(5)
                            .required()
                            .description('5 character long chart ID.'),
                        format: Joi.string()
                            .required()
                            .description('Export format (PDF, PNG, SVG)')
                    }),
                    payload: Joi.object({
                        unit: Joi.string().default('px'),
                        mode: Joi.string().default('rgb'),
                        width: Joi.number().default(600),
                        height: Joi.any(),
                        plain: Joi.boolean().default(false),
                        scale: Joi.number().default(1),
                        zoom: Joi.number().default(2),
                        border: Joi.object().keys({
                            width: Joi.number(),
                            color: Joi.string().default('auto')
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
                    params: Joi.object({
                        id: Joi.string()
                            .length(5)
                            .required()
                            .description('5 character long chart ID.'),
                        format: Joi.string()
                            .required()
                            .description('Export format (pdf, png, svg)')
                    }),
                    query: Joi.object({
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

function prepareChart(chart) {
    const { user, ...dataValues } = chart.dataValues;

    return {
        ...camelizeKeys(dataValues),
        metadata: dataValues.metadata,
        author: user ? { name: user.name, email: user.email } : undefined,
        guestSession: undefined
    };
}

async function findChartId() {
    const id = nanoid(5);
    return (await Chart.findByPk(id)) ? findChartId() : id;
}

async function getAllCharts(request, h) {
    const { query, url, auth } = request;
    const isAdmin = request.server.methods.isAdmin(request);

    const options = {
        order: [[decamelize(query.orderBy), query.order]],
        attributes: ['id', 'title', 'type', 'created_at', 'last_modified_at', 'public_version'],
        where: {
            deleted: {
                [Op.not]: true
            }
        },
        limit: query.limit,
        offset: query.offset
    };

    // A chart is published when it's public_version is > 0.
    if (query.published) {
        set(options, ['where', 'public_version', Op.gt], 0);
    }

    if (query.search) {
        const search = [
            { title: { [Op.like]: `%${query.search}%` } },
            { metadata: { describe: { intro: { [Op.like]: `%${query.search}%` } } } },
            { metadata: { describe: { byline: { [Op.like]: `%${query.search}%` } } } },
            { metadata: { describe: { 'source-name': { [Op.like]: `%${query.search}%` } } } },
            { metadata: { describe: { 'source-url': { [Op.like]: `%${query.search}%` } } } },
            { metadata: { annotate: { notes: { [Op.like]: `%${query.search}%` } } } }
        ];
        set(options, ['where', Op.or], search);
    }

    const model = Chart;

    if (auth.artifacts.role === 'guest') {
        set(options, ['where', 'guest_session'], auth.credentials.session);
    } else {
        set(options, ['where', 'author_id'], auth.artifacts.id);
    }

    if (isAdmin) {
        if (query.userId) {
            set(options, ['where', 'author_id'], query.userId);
        }

        if (query.userId === 'all') {
            delete options.where.author_id;
        }

        set(options, ['include'], [{ model: User, attributes: ['name', 'email'] }]);
    }

    const { count, rows } = await model.findAndCountAll(options);

    const charts = rows.map(chart => ({
        ...prepareChart(chart),
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
    const { url, params, auth, server } = request;
    const isAdmin = server.methods.isAdmin(request);

    const options = {
        where: {
            id: params.id,
            deleted: { [Op.not]: true }
        }
    };

    if (isAdmin) {
        set(options, ['include'], [{ model: User, attributes: ['name', 'email'] }]);
    }

    let chart = await Chart.findOne(options);

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
        ...prepareChart(chart),
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
    const { params, payload, auth, url, server } = request;
    const user = auth.artifacts;
    const isAdmin = server.methods.isAdmin(request);

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

    if (payload.organizationId && !isAdmin && !(await user.hasTeam(payload.organizationId))) {
        return Boom.unauthorized('User does not have access to the specified team.');
    }

    if (payload.folderId) {
        // check if folder belongs to user to team
        const folder = await Folder.findOne({ where: { id: payload.folderId } });

        if (
            !folder ||
            (!isAdmin &&
                folder.user_id !== auth.artifacts.id &&
                !(await user.hasTeam(folder.org_id)))
        ) {
            return Boom.unauthorized(
                'User does not have access to the specified folder, or it does not exist.'
            );
        }

        payload.organizationId = folder.org_id ? folder.org_id : null;
    }

    payload.inFolder = payload.folderId;
    delete payload.folderId;

    const newData = assign(prepareChart(chart), payload);

    chart = await chart.update({ ...decamelizeKeys(newData), metadata: newData.metadata });

    return {
        ...prepareChart(chart),
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
                error: new CodedError(
                    'notImplemented',
                    `the export format "${params.format}" is not available`
                )
            };
            throw error;
        }

        await request.server.methods.logAction(
            auth.artifacts.id,
            `chart/export/${params.format}`,
            params.id
        );

        const { stream, type } = successfulResult.data;
        return h.response(stream).header('Content-Type', type);
    } catch (error) {
        if (error.name === 'CodedError' && Boom[error.code]) {
            // this seems to be an orderly error
            return Boom[error.code](error.message);
        }
        // this is an unexpected error, so let's log it
        return Boom.badImplementation();
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

    request.payload = Object.assign(query, { border });
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
        request.logger.error(error);
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
        request.logger.error(error);
        return Boom.notFound();
    }
}

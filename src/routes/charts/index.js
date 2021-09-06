const Joi = require('joi');
const { Op, literal } = require('@datawrapper/orm').db;
const { decamelizeKeys, decamelize } = require('humps');
const set = require('lodash/set');
const { Chart, User } = require('@datawrapper/orm/models');
const { prepareChart } = require('../../utils/index.js');
const { listResponse, chartResponse } = require('../../schemas/response');
const createChart = require('@datawrapper/service-utils/createChart');

module.exports = {
    name: 'routes/charts',
    version: '1.0.0',
    register(server, options) {
        server.app.scopes.add('chart:read');
        server.app.scopes.add('chart:write');
        server.route({
            method: 'GET',
            path: '/',
            options: {
                tags: ['api'],
                description: 'List charts',
                auth: {
                    access: { scope: ['chart:read'] }
                },
                notes: `Search and filter a list of your charts.
                        The returned chart objects, do not include the full chart metadata.
                        To get the full metadata use [/v3/charts/{id}](ref:getchartsid).  Requires scope \`chart:read\`.`,
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
                            .valid('ASC', 'DESC')
                            .default('DESC')
                            .description('Result order (ascending or descending)'),
                        orderBy: Joi.string()
                            .valid('id', 'email', 'name', 'createdAt', 'lastModifiedAt')
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
                },
                response: listResponse
            },
            handler: getAllCharts
        });

        server.route({
            method: 'POST',
            path: '/',
            options: {
                tags: ['api'],
                description: 'Create new visualization',
                notes: 'Requires scope `chart:write`.',
                auth: {
                    access: { scope: ['chart:write'] }
                },
                validate: {
                    payload: Joi.object({
                        title: Joi.string()
                            .example('My cool chart')
                            .description(
                                'Title of your visualization. This will be the visualization headline.'
                            )
                            .allow(''),
                        theme: Joi.string()
                            .example('datawrapper')
                            .description('Chart theme to use.'),
                        type: Joi.string()
                            .example('d3-lines')
                            .description(
                                'Type of the visualization, like line chart, bar chart, ... Type keys can be found [here].'
                            ),
                        forkable: Joi.boolean().description(
                            'Set to true if you want to allow other users to fork this visualization'
                        ),
                        organizationId: Joi.string().description(
                            'ID of the team (formerly known as organization) that the visualization should be created in.  The authenticated user must have access to this team.'
                        ),
                        folderId: Joi.number()
                            .integer()
                            .description(
                                'ID of the folder that the visualization should be created in. The authenticated user must have access to this folder.'
                            ),
                        externalData: Joi.string().description('URL of external dataset'),
                        language: Joi.string()
                            .regex(/^[a-z]{2}([_-][A-Z]{2})?$/)
                            .description('Visualization locale (e.g. en-US)'),
                        lastEditStep: Joi.number()
                            .integer()
                            .min(1)
                            .max(4)
                            .description('Current position in chart editor workflow'),
                        metadata: Joi.object({
                            axes: Joi.alternatives().try(
                                Joi.object().description(
                                    'Mapping of dataset columns to visualization "axes"'
                                ),
                                Joi.array().length(0)
                            ), // empty array can happen due to PHP's array->object confusion
                            data: Joi.object({
                                transpose: Joi.boolean()
                            }).unknown(true),
                            describe: Joi.object({
                                intro: Joi.string()
                                    .description('The visualization description')
                                    .allow(''),
                                byline: Joi.string()
                                    .description('Byline as shown in the visualization footer')
                                    .allow(''),
                                'source-name': Joi.string()
                                    .description('Source as shown in visualization footer')
                                    .allow(''),
                                'source-url': Joi.string()
                                    .description('Source URL as shown in visualization footer')
                                    .allow(''),
                                'aria-description': Joi.string()
                                    .description(
                                        'Alternative description of visualization shown in screen readers (instead of the visualization)'
                                    )
                                    .allow('')
                            }).unknown(true),
                            annotate: Joi.object({
                                notes: Joi.string()
                                    .description('Notes as shown underneath visualization')
                                    .allow('')
                            }).unknown(true),
                            publish: Joi.object(),
                            custom: Joi.object()
                        })
                            .description(
                                'Metadata that saves all visualization specific settings and options.'
                            )
                            .unknown(true)
                    }).allow(null)
                },
                response: chartResponse
            },
            handler: createChartHandler
        });

        server.register(require('./{id}'), {
            routes: {
                prefix: '/{id}'
            }
        });
    }
};

async function getAllCharts(request, h) {
    const { query, url, auth } = request;
    const isAdmin = request.server.methods.isAdmin(request);
    const general = request.server.methods.config('general');

    const options = {
        order: [[decamelize(query.orderBy), query.order]],
        attributes: ['id', 'title', 'type', 'createdAt', 'last_modified_at', 'public_version'],
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
            literal(
                `MATCH(title, keywords) AGAINST ('${query.search.replace(
                    /'/g,
                    ''
                )}' IN BOOLEAN MODE)`
            )
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

    const charts = [];

    for (const chart of rows) {
        charts.push({
            ...(await prepareChart(chart)),
            thumbnails: general.imageDomain
                ? {
                      full: `//${general.imageDomain}/${
                          chart.id
                      }/${chart.getThumbnailHash()}/full.png`,
                      plain: `//${general.imageDomain}/${
                          chart.id
                      }/${chart.getThumbnailHash()}/plain.png`
                  }
                : undefined,
            url: `${url.pathname}/${chart.id}`
        });
    }

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

async function createChartHandler(request, h) {
    const { url, auth, payload, server } = request;
    const { session, token } = auth.credentials;
    const user = auth.artifacts;

    const newChart = {
        title: '',
        type: 'd3-bars',
        ...decamelizeKeys(payload),
        folderId: payload ? payload.folderId : undefined,
        teamId: payload ? payload.organizationId : undefined,
        metadata: payload && payload.metadata ? payload.metadata : { data: {} }
    };
    const chart = await createChart({ server, user, payload: newChart, session, token });

    // log chart/edit
    await request.server.methods.logAction(auth.artifacts.id, `chart/edit`, chart.id);

    return h
        .response({ ...(await prepareChart(chart)), url: `${url.pathname}/${chart.id}` })
        .code(201);
}

const fs = require('fs-extra');
const path = require('path');
const Joi = require('@hapi/joi');
const Boom = require('@hapi/boom');
const { Op } = require('@datawrapper/orm').db;
const { camelizeKeys, decamelizeKeys, decamelize } = require('humps');
const get = require('lodash/get');
const set = require('lodash/set');
const assign = require('assign-deep');
const mime = require('mime');
const {
    Chart,
    ChartPublic,
    ChartAccessToken,
    User,
    Folder,
    Plugin
} = require('@datawrapper/orm/models');
const CodedError = require('@datawrapper/shared/CodedError');
const { promisify } = require('util');
const mkdirAsync = promisify(fs.mkdir);
const writeFileAsync = promisify(fs.writeFile);
const accessAsync = promisify(fs.access);

const { listResponse, createResponseConfig, noContentResponse } = require('../schemas/response');

const chartResponse = createResponseConfig({
    schema: Joi.object({
        id: Joi.string(),
        title: Joi.string(),
        metadata: Joi.object()
    }).unknown()
});

const { publishChart } = require('../publish/publish');

module.exports = {
    name: 'chart-routes',
    version: '1.0.0',
    register: register
};

function register(server, options) {
    server.route({
        method: 'GET',
        path: '/',
        options: {
            tags: ['api'],
            description: 'List charts',
            notes: `Search and filter a list of your charts.
                        The returned chart objects, do not include the full chart metadata.
                        To get the full metadata use [/v3/charts/{id}](ref:getchartsid).`,
            validate: {
                query: Joi.object({
                    userId: Joi.any().description('ID of the user to fetch charts for.'),
                    published: Joi.boolean().description(
                        'Flag to filter results by publish status'
                    ),
                    search: Joi.string().description('Search for charts with a specific title.'),
                    order: Joi.string()
                        .uppercase()
                        .valid('ASC', 'DESC')
                        .default('DESC')
                        .description('Result order (ascending or descending)'),
                    orderBy: Joi.string()
                        .valid('id', 'email', 'name', 'createdAt')
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
        method: 'GET',
        path: '/{id}',
        options: {
            tags: ['api'],
            description: 'Fetch chart metadata',
            validate: {
                params: Joi.object({
                    id: Joi.string()
                        .length(5)
                        .required()
                        .description('5 character long chart ID.')
                }),
                query: Joi.object({
                    withData: Joi.boolean()
                })
            },
            response: chartResponse
        },
        handler: getChart
    });

    server.route({
        method: 'GET',
        path: '/{id}/{token}',
        options: {
            auth: false,
            description: 'Fetch chart metadata with one time token',
            validate: {
                params: Joi.object({
                    id: Joi.string()
                        .length(5)
                        .required()
                        .description('5 character long chart ID.'),
                    token: Joi.string()
                        .required()
                        .description('One time access token.')
                }),
                query: Joi.object({
                    withData: Joi.boolean()
                })
            },
            response: chartResponse
        },
        handler: getChartWithToken
    });

    server.route({
        method: 'DELETE',
        path: '/{id}',
        options: {
            tags: ['api'],
            description: 'Delete a chart',
            notes: `This action is permanent. Be careful when using this endpoint.
                        If this endpoint should be used in an application (CMS), it is recommended to
                        ask the user for confirmation.`,
            validate: {
                params: Joi.object({
                    id: Joi.string()
                        .length(5)
                        .required()
                        .description('5 character long chart ID.')
                })
            },
            response: noContentResponse
        },
        handler: deleteChart
    });

    server.route({
        method: 'PATCH',
        path: '/{id}',
        options: {
            tags: ['api'],
            description: 'Update chart metadata',
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
                            'Type of the chart ([Reference](https://developer.datawrapper.de/v3.0/docs/chart-types))'
                        ),
                    lastEditStep: Joi.number()
                        .integer()
                        .example(1)
                        .description(
                            'Used in the app to determine where the user last edited the chart.'
                        ),
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
                        .description('Metadata that saves all chart specific settings and options.')
                        .unknown(true)
                }).unknown()
            },
            response: chartResponse
        },
        handler: editChart
    });

    server.route({
        method: 'POST',
        path: '/',
        options: {
            tags: ['api'],
            description: 'Create new chart',
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
                        .description('Metadata that saves all chart specific settings and options.')
                        .unknown(true)
                })
                    .unknown(true)
                    .allow(null)
            },
            response: chartResponse
        },
        handler: createChart
    });

    server.route({
        method: 'POST',
        path: '/{id}/export/{format}',
        options: {
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
                    height: Joi.number()
                        .min(1)
                        .allow('auto'),
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
            description: 'Export chart',
            notes: `Export your chart as image or document for use in print or presentations.
                        Not all formats might be available to you, based on your account.`,
            plugins: {
                'hapi-swagger': {
                    produces: ['image/png', 'image/svg+xml', 'application/pdf']
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
                        .description('Export format (pdf, png, svg)')
                }),
                query: Joi.object({
                    unit: Joi.string().default('px'),
                    mode: Joi.string()
                        .valid('rgb', 'cmyk')
                        .default('rgb'),
                    width: Joi.number()
                        .default(600)
                        .min(1)
                        .optional(),
                    height: Joi.number()
                        .min(1)
                        .allow('auto'),
                    plain: Joi.boolean().default(false),
                    scale: Joi.number().default(1),
                    zoom: Joi.number().default(2),
                    borderWidth: Joi.number(),
                    borderColor: Joi.string(),
                    download: Joi.boolean().default(false)
                })
            }
        },
        handler: handleChartExport
    });

    server.route({
        method: 'GET',
        path: '/{id}/assets/{asset}',
        options: {
            tags: ['api'],
            description: 'Fetch chart asset',
            notes: `Request an asset associated with a chart.`,
            plugins: {
                'hapi-swagger': {
                    produces: ['text/csv', 'application/json']
                }
            },
            validate: {
                params: Joi.object({
                    id: Joi.string()
                        .length(5)
                        .required(),
                    asset: Joi.string()
                        .required()
                        .description('Full filename including extension.')
                })
            }
        },
        handler: getChartAsset
    });

    server.route({
        method: 'GET',
        path: '/{id}/data',
        options: {
            tags: ['api'],
            description: 'Fetch chart data',
            notes: `Request the data of a chart, which is usually a CSV.`,
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

    async function getChartData(request, h) {
        const { params } = request;

        let filename = `${params.id}.csv`;

        const res = await request.server.inject({
            method: 'GET',
            url: `/v3/charts/${params.id}/assets/${filename}`,
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

    server.route({
        method: 'PUT',
        path: '/{id}/assets/{asset}',
        options: {
            tags: ['api'],
            description: 'Upload chart data',
            notes: `Upload data for a chart, which is usually a CSV.
                        An example looks like this: \`/v3/charts/{id}/assets/{id}.csv.\``,
            plugins: {
                'hapi-swagger': {
                    consumes: ['text/csv', 'application/json']
                }
            },
            validate: {
                params: Joi.object({
                    id: Joi.string()
                        .length(5)
                        .required(),
                    asset: Joi.string()
                        .required()
                        .description('Full filename including extension.')
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
                defaultContentType: 'text/csv',
                allow: ['text/csv', 'application/json']
            }
        },
        handler: writeChartAsset
    });

    server.route({
        method: 'PUT',
        path: '/{id}/data',
        options: {
            tags: ['api'],
            description: 'Upload chart data',
            notes: `Upload data for a chart or map.`,
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
                defaultContentType: 'text/csv',
                allow: ['text/csv', 'application/json']
            }
        },
        handler: writeChartData
    });

    server.route({
        method: 'POST',
        path: '/{id}/publish',
        options: {
            tags: ['api'],
            validate: {
                params: Joi.object({
                    id: Joi.string()
                        .length(5)
                        .required()
                })
            }
        },
        handler: publishChart
    });

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

    const { events, event } = server.app;
    const { general, frontend } = server.methods.config();
    const { localChartAssetRoot } = general;
    const eventList = events.eventNames();
    const hasRegisteredDataPlugins =
        eventList.includes(event.GET_CHART_ASSET) && eventList.includes(event.PUT_CHART_ASSET);

    if (localChartAssetRoot === undefined && !hasRegisteredDataPlugins) {
        server
            .logger()
            .error(
                '[Config] You need to configure `general.localChartAssetRoot` or install a plugin that implements chart asset storage.'
            );
        process.exit(1);
    }

    if (!hasRegisteredDataPlugins) {
        events.on(event.GET_CHART_ASSET, async function({ chart, filename }) {
            const filePath = path.join(
                localChartAssetRoot,
                getDataPath(chart.dataValues.created_at),
                filename
            );
            try {
                await accessAsync(filePath, fs.constants.R_OK);
            } catch (e) {
                throw new CodedError('notFound', 'chart asset not found');
            }
            return fs.createReadStream(filePath);
        });

        events.on(event.PUT_CHART_ASSET, async function({ chart, data, filename }) {
            const outPath = path.join(
                localChartAssetRoot,
                getDataPath(chart.dataValues.created_at)
            );

            await mkdirAsync(outPath, { recursive: true });
            await writeFileAsync(path.join(outPath, filename), data);
            return { code: 200 };
        });
    }

    const hasRegisteredPublishPlugin = eventList.includes(event.PUBLISH_CHART);

    if (!hasRegisteredPublishPlugin) {
        const protocol = frontend.https ? 'https' : 'http';
        events.on(event.PUBLISH_CHART, async ({ chart, outDir }) => {
            const dest = path.resolve(general.localChartPublishRoot, chart.id);
            await fs.move(outDir, dest, { overwrite: true });

            return `${protocol}://${general.chart_domain}/${chart.id}`;
        });
    }
}

function prepareChart(chart) {
    const { user, in_folder, ...dataValues } = chart.dataValues;

    return {
        ...camelizeKeys(dataValues),
        folderId: in_folder,
        metadata: dataValues.metadata,
        author: user ? { name: user.name, email: user.email } : undefined,
        guestSession: undefined
    };
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

async function getBasemap(chart, request) {
    const { server, auth } = request;
    // TO DO: set default basemap as fallback
    const basemapId = get(chart, 'metadata.visualize.basemap');

    let basemap = {};
    if (basemapId === 'custom_upload') {
        const { result: content } = await server.inject({
            url: `/v3/charts/${chart.id}/assets/${chart.id}.map.json`,
            auth
        });
        basemap = {
            content,
            meta: {
                regions: get(chart, 'metadata.visualize.basemapRegions'),
                projection: {
                    type: get(chart, 'metadata.visualize.basemapProjection')
                },
                extent: {
                    padding: false,
                    exclude: {}
                }
            }
        };

        // gather all unique keys from basemap and include them in metadata
        const keyIds = [];
        basemap.content.objects[basemap.meta.regions].geometries.forEach(geo => {
            for (const key in geo.properties) {
                if (key !== 'cx' && key !== 'cy' && !keyIds.includes(key)) {
                    keyIds.push(key);
                }
            }
        });
        const keys = keyIds.map(key => ({ value: key, label: key }));
        basemap.meta.keys = keys;
    } else {
        const { result } = await server.inject({
            url: `/v3/basemaps/${basemapId}`,
            auth
        });
        basemap = result;
    }
    basemap.__id = basemapId;
    return basemap;
}

async function getBulkData(chart, request) {
    const { params, server, auth } = request;
    const res = await request.server.inject({
        url: `/v3/charts/${params.id}/data`,
        auth
    });

    const data = { chart: res.result };

    if (chart.type === 'd3-maps-choropleth' || chart.type === 'd3-maps-symbols') {
        data.basemap = await getBasemap(chart, request);
    }

    if (chart.type === 'locator-map') {
        const isMinimapBoundaryEnabled =
            get(chart, 'metadata.visualize.miniMap.enabled', false) &&
            get(chart, 'metadata.visualize.miniMap.opt') === 'boundary';
        const isHighlightEnabled = get(chart, 'metadata.visualize.highlight.enabled', false);

        let minimap, highlight;

        if (isMinimapBoundaryEnabled) {
            minimap = await server.inject({
                url: `/v3/charts/${chart.id}/assets/${chart.id}.minimap.json`,
                auth
            });
        }

        if (isHighlightEnabled) {
            highlight = await server.inject({
                url: `/v3/charts/${chart.id}/assets/${chart.id}.highlight.json`,
                auth
            });
        }

        data.minimap = minimap.result.replace(/(\d+.\d{1,3})\d+/g, '$1');
        data.highlight = highlight.result.replace(/(\d+.\d{1,3})\d+/g, '$1');
    }

    return data;
}

async function getChart(request, h) {
    const { url, query, params, auth, server } = request;
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
    const isOneTimeAccess = auth.isInjected && auth.strategy === 'one_time_token';

    const isEditable =
        isOneTimeAccess ||
        isGuestChart ||
        (await chart.isEditableBy(auth.artifacts, auth.credentials.session));

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

    const forkedFromId = chart.dataValues.is_fork ? chart.dataValues.forked_from : null;

    const results = await server.app.events.emit(server.app.event.ADDITIONAL_CHART_DATA, {
        chartId: chart.id,
        forkedFromId
    });

    const additionalMetaData = results.reduce((obj, event) => {
        if (event.status === 'success') {
            Object.assign(obj, event.data);
        }
        return obj;
    }, {});

    if (forkedFromId) {
        const forkedFromChart = await Chart.findByPk(forkedFromId);
        const basedOnBylineText = get(forkedFromChart, 'dataValues.metadata.describe.byline', null);

        if (basedOnBylineText) {
            let basedOnUrl = '';

            const sourceUrl = get(additionalMetaData, 'river.source_url', null);
            if (sourceUrl) basedOnUrl = sourceUrl;
            else {
                const results = await server.app.events.emit(
                    server.app.event.GET_CHART_DISPLAY_URL,
                    {
                        chartId: chart.id
                    }
                );

                const chartDisplayData = results.reduce((obj, event) => {
                    if (event.status === 'success') {
                        Object.assign(obj, event.data);
                    }
                    return obj;
                }, {});

                const chartDisplayUrl = chartDisplayData.url;
                if (chartDisplayUrl) basedOnUrl = chartDisplayUrl;
            }

            chart.dataValues.basedOnByline = basedOnUrl
                ? `<a href='${basedOnUrl}' target='_blank'>${basedOnBylineText}</a>`
                : basedOnBylineText;
        }
    }

    let data;
    if (query.withData) {
        try {
            data = await getBulkData(chart.dataValues, request);
        } catch (error) {
            request.server.logger().error(error);
            data = null;
        }
    }

    return {
        ...prepareChart(chart, additionalMetaData),
        data,
        url: `${url.pathname}`
    };
}

async function getChartWithToken(request, h) {
    const { params, url, server } = request;

    const row = await ChartAccessToken.findOne({
        where: {
            chart_id: params.id,
            token: params.token
        }
    });

    if (!row) {
        return Boom.unauthorized();
    }

    const response = await server.inject({
        url: `/v3/charts/${params.id}${url.search}`,
        auth: {
            strategy: 'one_time_token',
            credentials: {
                token: params.token
            }
        }
    });

    await row.destroy();

    return response.result;
}

async function createChart(request, h) {
    const { url, auth, payload, server } = request;
    const user = auth.artifacts;
    const isAdmin = server.methods.isAdmin(request);

    async function findChartId() {
        const id = server.methods.generateToken(5);
        return (await Chart.findByPk(id)) ? findChartId() : id;
    }

    if (
        payload &&
        payload.organizationId &&
        !isAdmin &&
        !(await user.hasTeam(payload.organizationId))
    ) {
        return Boom.unauthorized('User is not allowed to create a chart in that team.');
    }

    if (payload && payload.folderId) {
        // check if folder belongs to user to team
        const folder = await Folder.findOne({ where: { id: payload.folderId } });

        if (
            !folder ||
            (!isAdmin &&
                folder.user_id !== auth.artifacts.id &&
                !(await user.hasTeam(folder.org_id)))
        ) {
            payload.folderId = undefined;
            request.logger.info('Invalid folder id. User does not have access to this folder');
        } else {
            payload.inFolder = payload.folderId;
            payload.folderId = undefined;
            payload.organizationId = folder.org_id ? folder.org_id : null;
        }
    }

    const id = await findChartId();
    const chart = await Chart.create({
        title: '',
        theme: 'default',
        type: 'd3-bars',
        language: user.language,
        ...decamelizeKeys(payload),
        metadata: payload && payload.metadata ? payload.metadata : { data: {} },
        author_id: user.id,
        guest_session: user.role === 'guest' ? auth.credentials.session : undefined,
        id
    });

    // log chart/edit
    await request.server.methods.logAction(user.id, `chart/edit`, chart.id);

    return h.response({ ...prepareChart(chart), url: `${url.pathname}/${chart.id}` }).code(201);
}

async function editChart(request, h) {
    const { params, payload, auth, url, server } = request;
    const user = auth.artifacts;
    const isAdmin = server.methods.isAdmin(request);

    const chart = await Chart.findOne({
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
            throw Boom.unauthorized(
                'User does not have access to the specified folder, or it does not exist.'
            );
        }
        payload.inFolder = payload.folderId;
        payload.folderId = undefined;
        payload.organizationId = folder.org_id ? folder.org_id : null;
    }

    if ('authorId' in payload && !isAdmin) {
        delete payload.authorId;
    }

    const newData = assign(prepareChart(chart), payload);

    await Chart.update(
        { ...decamelizeKeys(newData), metadata: newData.metadata },
        { where: { id: chart.id }, limit: 1 }
    );
    await chart.reload();
    // log chart/edit
    await request.server.methods.logAction(user.id, `chart/edit`, chart.id);

    return {
        ...prepareChart(chart),
        url: `${url.pathname}`
    };
}

async function exportChart(request, h) {
    const { query, payload, params, auth, logger, server } = request;
    const { events, event } = server.app;
    const user = auth.artifacts;

    const userPlugins = await user.getUserPluginCache();
    const plugins = userPlugins && userPlugins.plugins ? userPlugins.plugins.split(',') : [];

    if (params.format !== 'png' && !plugins.includes('export-pdf')) {
        const pdfPlugin = await Plugin.findByPk('export-pdf');

        if (pdfPlugin && pdfPlugin.is_private) {
            return Boom.forbidden();
        }
    }

    Object.assign(payload, params);
    try {
        const results = await events.emit(event.CHART_EXPORT, {
            data: payload,
            userId: user.id,
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

        await request.server.methods.logAction(user.id, `chart/export/${params.format}`, params.id);

        const { stream, type } = successfulResult.data;

        if (query.download) {
            return h
                .response(stream)
                .header(
                    'Content-Disposition',
                    `attachment; filename="${params.id}.${params.format}"`
                );
        } else {
            return h.response(stream).header('Content-Type', type);
        }
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
        attributes: ['id', 'author_id', 'created_at', 'type', 'guest_session', 'organization_id']
    });

    if (!chart) {
        throw Boom.notFound();
    }

    return chart;
}

async function getChartAsset(request, h) {
    const { params } = request;
    const { events, event } = request.server.app;
    const chart = await loadChart(request);

    const filename = params.asset;

    try {
        const eventResults = await events.emit(event.GET_CHART_ASSET, { chart, filename });
        const successResult = eventResults.find(e => e.status === 'success');

        if (!successResult) {
            const errorResult = eventResults.find(e => e.status === 'error');
            throw errorResult
                ? errorResult.error
                : new Error(`${event.GET_CHART_ASSET} event failed`);
        }

        const contentStream = successResult.data;

        const contentType =
            chart.type === 'locator-map' && path.extname(filename) === '.csv'
                ? 'application/json'
                : mime.getType(filename);

        return h
            .response(contentStream)
            .header('Content-Type', contentType)
            .header('Content-Disposition', `attachment; filename=${filename}`);
    } catch (error) {
        if (error.name === 'CodedError' && Boom[error.code]) {
            // this seems to be an orderly error
            return Boom[error.code](error.message);
        }
        request.logger.error(error.message);
        return Boom.badImplementation();
    }
}

function getAssetWhitelist(id) {
    return ['{id}.csv', '{id}.map.json', '{id}.minimap.json', '{id}.highlight.json'].map(name =>
        name.replace('{id}', id)
    );
}

async function writeChartAsset(request, h) {
    const { params, auth } = request;
    const { events, event } = request.server.app;
    const user = auth.artifacts;
    const chart = await loadChart(request);

    const isGuestChart = chart.guest_session === request.auth.credentials.session;
    const isEditable = isGuestChart || (await chart.isEditableBy(request.auth.artifacts));

    if (!isEditable) {
        return Boom.forbidden();
    }

    if (!getAssetWhitelist(params.id).includes(params.asset)) {
        return Boom.badRequest();
    }

    const filename = params.asset;

    try {
        const eventResults = await events.emit(event.PUT_CHART_ASSET, {
            chart,
            data:
                request.headers['content-type'] === 'application/json'
                    ? JSON.stringify(request.payload)
                    : request.payload,
            filename
        });

        const { code } = eventResults.find(e => e.status === 'success').data;

        // log chart/edit
        await request.server.methods.logAction(user.id, `chart/edit`, chart.id);

        return h.response().code(code);
    } catch (error) {
        request.logger.error(error.message);
        return Boom.notFound();
    }
}

function getDataPath(date) {
    const year = date.getUTCFullYear();
    const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
    return `${year}${month}`;
}

const Joi = require('@hapi/joi');
const Boom = require('@hapi/boom');
const { Op } = require('@datawrapper/orm').db;
const { decamelizeKeys, decamelize } = require('humps');
const set = require('lodash/set');
const { Chart, User, Folder } = require('@datawrapper/orm/models');
const { prepareChart } = require('../../utils/index.js');
const { listResponse, chartResponse } = require('../../schemas/response');

module.exports = {
    name: 'routes/charts',
    version: '1.0.0',
    register(server, options) {
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
                        search: Joi.string().description(
                            'Search for charts with a specific title.'
                        ),
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
                            .description(
                                'Metadata that saves all chart specific settings and options.'
                            )
                            .unknown(true)
                    })
                        .unknown(true)
                        .allow(null)
                },
                response: chartResponse
            },
            handler: createChart
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

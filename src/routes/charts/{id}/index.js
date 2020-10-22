const Joi = require('@hapi/joi');
const Boom = require('@hapi/boom');
const { Op } = require('@datawrapper/orm').db;
const { Chart, ChartPublic, User, Folder } = require('@datawrapper/orm/models');
const get = require('lodash/get');
const set = require('lodash/set');
const assignWithEmptyObjects = require('../../../utils/assignWithEmptyObjects');
const { decamelizeKeys } = require('humps');
const { prepareChart } = require('../../../utils/index.js');
const { noContentResponse, chartResponse } = require('../../../schemas/response');

module.exports = {
    name: 'routes/charts/{id}',
    version: '1.0.0',
    register(server, options) {
        // GET /v3/charts/{id}
        server.route({
            method: 'GET',
            path: '/',
            options: {
                tags: ['api'],
                description: 'Fetch chart metadata',
                auth: {
                    access: { scope: ['chart:read', 'chart:write'] }
                },
                validate: {
                    params: Joi.object({
                        id: Joi.string()
                            .length(5)
                            .required()
                            .description('5 character long chart ID.')
                    }),
                    query: Joi.object({
                        published: Joi.boolean()
                    }).unknown(true)
                },
                response: chartResponse
            },
            handler: getChart
        });

        // DELETE /v3/charts/{id}
        server.route({
            method: 'DELETE',
            path: '/',
            options: {
                tags: ['api'],
                description: 'Delete a chart',
                notes: `This action is permanent. Be careful when using this endpoint.
                        If this endpoint should be used in an application (CMS), it is recommended to
                        ask the user for confirmation.`,
                auth: {
                    access: { scope: ['chart', 'chart:write'] }
                },
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

        const editChartPayload = Joi.object({
            title: Joi.string()
                .example('My cool chart')
                .allow('')
                .description('Title of your chart. This will be the chart headline.'),
            theme: Joi.string().example('datawrapper').description('Chart theme to use.'),
            type: Joi.string()
                .example('d3-lines')
                .description(
                    'Type of the chart ([Reference](https://developer.datawrapper.de/v3.0/docs/chart-types))'
                ),
            lastEditStep: Joi.number()
                .integer()
                .example(1)
                .description('Used in the app to determine where the user last edited the chart.'),
            folderId: Joi.number().allow(null).optional(),
            organizationId: Joi.string().allow(null).optional(),
            metadata: Joi.object({
                data: Joi.object({
                    transpose: Joi.boolean()
                }).unknown(true)
            })
                .description('Metadata that saves all chart specific settings and options.')
                .unknown(true)
        }).unknown();

        // PATCH /v3/charts/{id}
        server.route({
            method: 'PATCH',
            path: '/',
            options: {
                tags: ['api'],
                description: 'Update chart. Allows for partial metadata updates (JSON merge patch)',
                auth: {
                    access: { scope: ['chart:write'] }
                },
                validate: {
                    params: Joi.object({
                        id: Joi.string()
                            .length(5)
                            .required()
                            .description('5 character long chart ID.')
                    }),
                    payload: editChartPayload
                },
                response: chartResponse
            },
            handler: editChart
        });

        // PUT /v3/charts/{id}
        server.route({
            method: 'PUT',
            path: '/',
            options: {
                tags: ['api'],
                description: 'Update chart. Replaces the entire metadata object.',
                auth: {
                    access: { scope: ['chart:write'] }
                },
                validate: {
                    params: Joi.object({
                        id: Joi.string()
                            .length(5)
                            .required()
                            .description('5 character long chart ID.')
                    }),
                    payload: editChartPayload
                },
                response: chartResponse
            },
            handler: editChart
        });

        require('./assets')(server, options);
        require('./data')(server, options);
        require('./embed-codes')(server, options);
        require('./export')(server, options);
        require('./publish')(server, options);
        require('./copy')(server, options);
    }
};

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

    const isEditable = await chart.isEditableBy(auth.artifacts, auth.credentials.session);

    if (query.published || !isEditable) {
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

    const additionalData = await getAdditionalMetadata(chart, { server });

    if (server.methods.config('general').imageDomain) {
        additionalData.thumbnails = {
            full: `//${server.methods.config('general').imageDomain}/${
                chart.id
            }/${chart.getThumbnailHash()}/full.png`,
            plain: `//${server.methods.config('general').imageDomain}/${
                chart.id
            }/${chart.getThumbnailHash()}/plain.png`
        };
    }

    return {
        ...(await prepareChart(chart, additionalData)),
        url: `${url.pathname}`
    };
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

    const isEditable = await chart.isEditableBy(auth.artifacts, auth.credentials.session);

    if (!isEditable) {
        return Boom.unauthorized();
    }

    if (payload.organizationId && !isAdmin && !(await user.hasTeam(payload.organizationId))) {
        return Boom.unauthorized('User does not have access to the specified team.');
    }

    if (payload && payload.type) {
        // validate chart type
        if (!server.app.visualizations.has(payload.type)) {
            return Boom.badRequest('Invalid chart type');
        }
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

    const newData = assignWithEmptyObjects(await prepareChart(chart), payload);

    if (request.method === 'put' && payload.metadata) {
        // in PUT request we replace the entire metadata object
        newData.metadata = payload.metadata;
    }

    await Chart.update(
        { ...decamelizeKeys(newData), metadata: newData.metadata },
        { where: { id: chart.id }, limit: 1 }
    );
    await chart.reload();
    // log chart/edit
    await request.server.methods.logAction(user.id, `chart/edit`, chart.id);

    return {
        ...(await prepareChart(chart)),
        url: `${url.pathname}`
    };
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

    const chart = await Chart.findOne(options);

    if (!chart) return Boom.notFound();

    if (
        !server.methods.isAdmin(request) &&
        !(await chart.isEditableBy(auth.artifacts, auth.credentials.session))
    ) {
        return Boom.forbidden();
    }

    await chart.update({
        deleted: true,
        deleted_at: new Date()
    });

    return h.response().code(204);
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

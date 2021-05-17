const Boom = require('@hapi/boom');
const Joi = require('@hapi/joi');
const { translate } = require('@datawrapper/service-utils/l10n');
const { getEmbedCodes } = require('./utils');

const { createResponseConfig } = require('../../../schemas/response');

module.exports = async (server, options) => {
    // GET /v3/charts/{id}/embed-codes
    server.route({
        method: 'GET',
        path: '/embed-codes',
        options: {
            tags: ['api'],
            description: 'Get embed codes for a chart',
            notes: `Request the responsive and static embed code of a chart. Requires scope \`chart:read\`.`,
            auth: {
                access: {
                    scope: ['chart:read']
                }
            },
            plugins: {
                'hapi-swagger': {
                    produces: ['application/json']
                }
            },
            validate: {
                params: Joi.object({
                    id: Joi.string().length(5).required()
                })
            },
            response: createResponseConfig({
                schema: Joi.array().items(
                    Joi.object({
                        id: Joi.string(),
                        preferred: Joi.boolean(),
                        title: Joi.string(),
                        template: Joi.string(),
                        code: Joi.string()
                    })
                )
            })
        },
        async handler(request, h) {
            const { params, auth, server } = request;

            const chart = await server.methods.loadChart(params.id);

            if (!chart) {
                return Boom.notFound();
            }
            if (!(await chart.isEditableBy(auth.artifacts, auth.credentials.session))) {
                return Boom.unauthorized();
            }

            return getEmbedCodes({
                visualizations: server.app.visualizations,
                chart,
                user: auth.artifacts
            });
        }
    });

    // GET /v3/charts/{id}/display-urls
    server.route({
        method: 'GET',
        path: '/display-urls',
        options: {
            tags: ['api'],
            description: 'Get share URLs for a chart',
            notes: `Request the available URLs to directly share a chart.`,
            auth: {
                access: {
                    scope: ['chart:read']
                }
            },
            plugins: {
                'hapi-swagger': {
                    produces: ['application/json']
                }
            },
            validate: {
                params: Joi.object({
                    id: Joi.string().length(5).required()
                })
            },
            response: createResponseConfig({
                schema: Joi.array().items(
                    Joi.object({
                        id: Joi.string(),
                        name: Joi.string(),
                        url: Joi.string()
                    })
                )
            })
        },
        async handler(request, h) {
            const { params, auth, server } = request;
            const chart = await server.methods.loadChart(params.id);

            const displayUrls = (
                await server.app.events.emit(
                    server.app.event.GET_CHART_DISPLAY_URL,
                    {
                        chart
                    },
                    { filter: 'success' }
                )
            ).map(el =>
                Object.assign(el, {
                    name: translate(el.id, { scope: 'core', language: auth.artifacts.language })
                })
            );

            return displayUrls;
        }
    });
};

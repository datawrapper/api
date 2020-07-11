const Joi = require('@hapi/joi');
const Boom = require('@hapi/boom');
const { createResponseConfig } = require('../../../schemas/response');
const { prepareChart } = require('../../../utils/index.js');
const { Chart, User } = require('@datawrapper/orm/models');

module.exports = (server, options) => {
    // POST /v3/charts/{id}/copy
    server.route({
        method: 'POST',
        path: '/copy',
        options: {
            tags: ['api'],
            description: 'Copies a chart',
            auth: {
                access: { scope: ['chart:write'] }
            },
            validate: {
                params: Joi.object({
                    id: Joi.string()
                        .length(5)
                        .required()
                })
            },
            response: createResponseConfig({
                schema: Joi.object({
                    data: Joi.object(),
                    version: Joi.number().integer(),
                    url: Joi.string().uri()
                }).unknown()
            })
        },
        handler: async (request, h) => {
            const { server, params, auth } = request;
            const { event, events } = server.app;
            const srcChart = await server.methods.loadChart(params.id);
            const isAdmin = server.methods.isAdmin(request);
            const user = await User.findByPk(auth.artifacts.id);
            const isEditable = await srcChart.isEditableBy(user, auth.credentials.session);

            if (!isEditable && !isAdmin) {
                return Boom.unauthorized();
            }

            if (srcChart.isFork) {
                return Boom.badRequest('You cannot duplicate a forked chart.');
            }

            async function findChartId() {
                const id = server.methods.generateToken(5);
                return (await Chart.findByPk(id)) ? findChartId() : id;
            }

            const chart = await Chart.create({
                id: await findChartId(),
                type: srcChart.type,
                title: `${srcChart.title} (Copy)`,
                metadata: srcChart.metadata,
                theme: srcChart.theme,
                locale: srcChart.locale,
                organizationId: srcChart.organizationId,
                inFolder: srcChart.inFolder,
                externalData: srcChart.externalData,

                forked_from: srcChart.id,
                author_id: user.id,

                last_edit_step: 3
            });

            if (isAdmin) {
                this.organizationId = null;
                this.inFolder = null;
            }

            const assets = ['.csv', '.map.json', '.minimap.json', '.highlight.json'];

            for (const filename of assets) {
                const response = await server.inject({
                    url: `/v3/charts/${srcChart.id}/assets/${srcChart.id + filename}`,
                    auth
                });

                if (!response || response.result.statusCode === 404) continue;

                await events.emit(event.PUT_CHART_ASSET, {
                    chart,
                    filename: chart.id + filename,
                    data: response.result
                });
            }

            // refresh external data
            await server.inject({
                url: `/v3/charts/${chart.id}/data/refresh`,
                method: 'POST',
                auth
            });

            events.emit(event.CHART_COPY, { chart });
            await request.server.methods.logAction(user.id, `chart/edit`, chart.id);
            return h.response({ ...prepareChart(chart) }).code(201);
        }
    });

    // POST /v3/charts/{id}/fork
    server.route({
        method: 'POST',
        path: '/fork',
        options: {
            tags: ['api'],
            description: 'Fork a chart',
            auth: {
                access: { scope: ['chart:write'] }
            },
            validate: {
                params: Joi.object({
                    id: Joi.string()
                        .length(5)
                        .required()
                })
            },
            response: createResponseConfig({
                schema: Joi.object({
                    data: Joi.object(),
                    version: Joi.number().integer(),
                    url: Joi.string().uri()
                }).unknown()
            })
        },
        handler: async (request, h) => {
            const { server, params, auth } = request;
            const chart = await server.methods.loadChart(params.id);
            const isAdmin = server.methods.isAdmin(request);
            const isEditable = await chart.isEditableBy(auth.artifacts, auth.credentials.session);

            if (!isEditable && !isAdmin) {
                return Boom.unauthorized();
            }

            /* $fork = ChartQuery::create()->copyPublicChart($chart, $user);
            if ($fork) {
                $fork->setInFolder(null);
                $fork->setTheme($GLOBALS['dw_config']['defaults']['theme']);
                $fork->updateMetadata('describe.byline', '');
                $fork->setIsFork(true);
                $fork->save();
                ok(array('id' => $fork->getId()));
            } else {
                error('not-found');
            } */
        }
    });
};

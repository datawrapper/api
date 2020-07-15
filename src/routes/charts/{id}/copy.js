const Joi = require('@hapi/joi');
const Boom = require('@hapi/boom');
const { prepareChart } = require('../../../utils/index.js');
const { translate } = require('../../../utils/l10n.js');
const { Chart, User, ChartPublic } = require('@datawrapper/orm/models');
const set = require('lodash/set');
const clone = require('lodash/clone');

module.exports = (server, options) => {
    const { event, events } = server.app;

    async function findChartId() {
        const id = server.methods.generateToken(5);
        return (await Chart.findByPk(id)) ? findChartId() : id;
    }

    async function copyChartAssets(srcChart, chart, copyPublic = false) {
        const assets = ['.csv', '.map.json', '.minimap.json', '.highlight.json'];

        for (const filename of assets) {
            try {
                const stream = await events.emit(
                    event.GET_CHART_ASSET,
                    {
                        chart: srcChart,
                        filename:
                            srcChart.id +
                            (filename === '.csv' && copyPublic ? '.public.csv' : filename)
                    },
                    { filter: 'first' }
                );

                let data = '';

                for await (const chunk of stream) {
                    data += chunk;
                }

                await events.emit(event.PUT_CHART_ASSET, {
                    chart,
                    filename: chart.id + filename,
                    data
                });
            } catch (ex) {
                continue;
            }
        }
    }

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
            }
        },
        handler: async (request, h) => {
            const { server, params, auth } = request;
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

            const newChart = {
                id: await findChartId(),
                type: srcChart.type,
                title: `${srcChart.title} (${translate('copy', {
                    scope: 'core',
                    language: auth.artifacts.language
                })})`,
                metadata: clone(srcChart.metadata),
                theme: srcChart.theme,
                locale: srcChart.locale,
                organization_id: srcChart.organization_id,
                inFolder: srcChart.inFolder,
                externalData: srcChart.externalData,

                forked_from: srcChart.id,
                author_id: user.id,

                last_edit_step: 3
            };

            if (isAdmin) {
                newChart.organization_id = null;
                newChart.inFolder = null;
            }

            const chart = await Chart.create(newChart);

            await copyChartAssets(srcChart, chart);

            try {
                // refresh external data
                await server.inject({
                    url: `/v3/charts/${chart.id}/data/refresh`,
                    method: 'POST',
                    auth
                });
            } catch (ex) {}

            await events.emit(event.CHART_COPY, { sourceChart: srcChart, destChart: chart });
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
            }
        },
        handler: async (request, h) => {
            const { server, params, auth } = request;
            const user = auth.artifacts;
            const srcChart = await server.methods.loadChart(params.id);

            if (!srcChart.forkable) {
                return Boom.unauthorized();
            }

            const publicChart = await ChartPublic.findByPk(srcChart.id);

            if (!publicChart) {
                return Boom.notFound();
            }

            const newMeta = clone(publicChart.metadata);
            set(newMeta, 'describe.byline', '');

            const newChart = {
                id: await findChartId(),
                type: publicChart.type,
                title: publicChart.title,
                metadata: newMeta,
                externalData: publicChart.externalData,
                forked_from: publicChart.id,
                is_fork: true,
                theme: 'default',
                last_edit_step: 3
            };

            if (user.role === 'guest') {
                newChart.guest_session = auth.credentials.session;
            } else {
                newChart.organization_id = (await user.getActiveTeam()).id;
                newChart.author_id = user.id;
            }

            const chart = await Chart.create(newChart);
            await copyChartAssets(auth, srcChart, chart, true);

            try {
                // refresh external data
                await server.inject({
                    url: `/v3/charts/${chart.id}/data/refresh`,
                    method: 'POST',
                    auth
                });
            } catch (ex) {}

            return h.response({ ...prepareChart(chart) }).code(201);
        }
    });
};

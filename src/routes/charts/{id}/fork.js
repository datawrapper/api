const Joi = require('joi');
const Boom = require('@hapi/boom');
const { prepareChart } = require('../../../utils/index.js');
const createChart = require('@datawrapper/service-utils/createChart');
const { ChartPublic } = require('@datawrapper/orm/models');
const get = require('lodash/get');
const set = require('lodash/set');
const clone = require('lodash/clone');

module.exports = (server, options) => {
    const { event, events } = server.app;

    // POST /v3/charts/{id}/fork
    server.route({
        method: 'POST',
        path: '/fork',
        options: {
            tags: ['api'],
            description: 'Fork a chart',
            notes: 'Requires scope `chart:write`.',
            auth: {
                access: { scope: ['chart:write'] }
            },
            validate: {
                params: Joi.object({
                    id: Joi.string().length(5).required()
                })
            }
        },
        async handler(request, h) {
            const { server, params, auth, headers } = request;
            const user = auth.artifacts;
            const { session } = auth.credentials;
            const srcChart = await server.methods.loadChart(params.id);

            if (!srcChart.forkable) {
                return Boom.unauthorized();
            }

            // use source chart to get protect forks status (so users don't have to republish)
            const isProtectedFork = get(srcChart, 'metadata.publish.protect-forks', true);

            // get public chart to get values
            const publicChart = await ChartPublic.findByPk(srcChart.id);

            if (!publicChart) {
                // visualizations must be published before they can
                // be forked
                return Boom.notFound();
            }

            const newMeta = clone(publicChart.metadata);

            if (isProtectedFork) {
                // forks of in "protected" visualizations, we're showing the original byline
                // as "Based on" attribution, so we need to empty the new byline
                set(newMeta, 'describe.byline', '');
            }

            // forks shouldn't inherit reuse settings of the source chart
            set(newMeta, 'publish.show-in-river', false);
            set(newMeta, 'publish.blocks.edit-in-datawrapper', false);

            const newChart = {
                type: publicChart.type,
                title: publicChart.title,
                metadata: newMeta,
                external_data: publicChart.external_data,
                forked_from: publicChart.id,
                is_fork: isProtectedFork,
                last_edit_step: 3
            };

            const chart = await createChart({ server, user, payload: newChart, session });
            await server.methods.copyChartAssets(srcChart, chart, true);

            try {
                // refresh external data
                await server.inject({
                    url: `/v3/charts/${chart.id}/data/refresh`,
                    method: 'POST',
                    auth,
                    headers
                });
            } catch (ex) {}

            // log chart/fork
            await request.server.methods.logAction(user.id, `chart/fork`, chart.id);

            await events.emit(event.CHART_FORK, { sourceChart: srcChart, destChart: chart });
            return h.response({ ...(await prepareChart(chart)) }).code(201);
        }
    });
};

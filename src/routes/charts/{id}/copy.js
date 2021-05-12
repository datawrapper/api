const Joi = require('@hapi/joi');
const Boom = require('@hapi/boom');
const { prepareChart } = require('../../../utils/index.js');
const { translate } = require('@datawrapper/service-utils/l10n');
const findChartId = require('@datawrapper/service-utils/findChartId');
const { User } = require('@datawrapper/orm/models');
const clone = require('lodash/clone');
const createChart = require('@datawrapper/service-utils/createChart');

module.exports = (server, options) => {
    const { event, events } = server.app;

    // POST /v3/charts/{id}/copy
    server.route({
        method: 'POST',
        path: '/copy',
        options: {
            tags: ['api'],
            description: 'Copies a chart',
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
            const { session } = auth.credentials;
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
                id: await findChartId(server),
                type: srcChart.type,
                title: `${srcChart.title} (${translate('copy', {
                    scope: 'core',
                    language: auth.artifacts.language
                })})`,
                metadata: clone(srcChart.metadata),
                theme: srcChart.theme,
                language: srcChart.language,
                organization_id: srcChart.organization_id,
                in_folder: srcChart.in_folder,
                external_data: srcChart.external_data,

                forked_from: srcChart.id,
                author_id: user.id,

                last_edit_step: 3
            };

            if (isAdmin) {
                newChart.organization_id = null;
                newChart.in_folder = null;
            }

            const chart = await createChart({ server, user, payload: newChart, session });
            await server.methods.copyChartAssets(srcChart, chart);

            try {
                // refresh external data
                await server.inject({
                    url: `/v3/charts/${chart.id}/data/refresh`,
                    method: 'POST',
                    auth,
                    headers
                });
            } catch (ex) {}

            // log chart/copy
            await request.server.methods.logAction(user.id, `chart/copy`, chart.id);

            await events.emit(event.CHART_COPY, { sourceChart: srcChart, destChart: chart });
            await server.methods.logAction(user.id, `chart/edit`, chart.id);
            return h.response({ ...(await prepareChart(chart)) }).code(201);
        }
    });
};

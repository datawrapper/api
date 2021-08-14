const Boom = require('@hapi/boom');
const Joi = require('joi');
const { ChartPublic } = require('@datawrapper/orm/models');

module.exports = (server, options) => {
    // POST /v3/charts/{id}/unpublish
    server.route({
        method: 'POST',
        path: '/unpublish',
        options: {
            tags: ['api'],
            description: 'Unpublish a chart',
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
        handler: unpublishChart
    });
};

async function unpublishChart(request, h) {
    const { params, auth, server } = request;
    const { events, event } = server.app;
    const user = auth.artifacts;
    const chart = await server.methods.loadChart(params.id);

    if (!chart || !(await chart.isPublishableBy(user))) {
        throw Boom.unauthorized();
    }

    if (chart.public_version === 0) {
        throw Boom.badRequest('Chart cannot be unpublished as it has not been published yet.');
    }

    const publicVersion = chart.public_version;

    await chart.update({
        last_edit_step: 4,
        published_at: null,
        public_version: 0
    });

    const publicChart = await ChartPublic.findByPk(params.id);
    if (publicChart) {
        await publicChart.destroy();
    }

    await events.emit(event.UNPUBLISH_CHART, {
        chart,
        publicVersion
    });

    await server.methods.logAction(user.id, `chart/${params.id}/unpublish`, '');

    return h.response().code(204);
}

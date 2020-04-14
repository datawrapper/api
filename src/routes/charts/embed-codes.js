const { Chart } = require('@datawrapper/orm/models');
const { getUserData } = require('@datawrapper/orm/utils/userData');
const Boom = require('@hapi/boom');
const Joi = require('@hapi/joi');
const get = require('lodash/get');
const { translate } = require('../../utils/l10n');
const sanitizeHtml = require('sanitize-html');

module.exports = (server, options) => {
    server.route({
        method: 'GET',
        path: '/{id}/embed-codes',
        options: {
            tags: ['api'],
            description: 'Get embed codes for a chart',
            notes: `Request the data of a chart, which is usually a CSV.`,
            plugins: {
                'hapi-swagger': {
                    produces: ['application/json']
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
        async handler(request, h) {
            const { params, auth } = request;

            const chart = await Chart.findByPk(params.id);

            if (!chart) {
                return Boom.notFound();
            }
            if (!(await chart.isPublishableBy(auth.artifacts))) {
                return Boom.unauthorized();
            }

            const __ = key => translate(key, { scope: 'core', language: auth.artifacts.language });

            const vis = server.app.visualizations.get(chart.type);
            const ariaLabel = vis.ariaLabel || vis.title || __('chart');

            const team = await chart.getTeam();
            const preferred =
                team && get(team, 'settings.embed.preferred_embed')
                    ? get(team, 'settings.embed.preferred_embed')
                    : await getUserData(auth.artifacts.id, 'embed_type', 'responsive');

            const templates = [
                // responsive iframe
                {
                    id: 'responsive',
                    preferred: preferred === 'responsive',
                    title: __('publish / embed / responsive'),
                    template: getTemplate(
                        `<iframe title="%chart_title%" aria-label="%chart_type%" id="datawrapper-chart-%chart_id%" src="%chart_url%" scrolling="no" frameborder="0" style="width: 0; min-width: 100% !important; border: none;" height="%chart_height%"></iframe><script type="text/javascript"></script>`
                    )
                },
                // standard iframe
                {
                    id: 'iframe',
                    preferred: preferred === 'iframe',
                    title: __('publish / embed / iframe'),
                    template: getTemplate(
                        `<iframe title="%chart_title%" aria-label="%chart_type%" id="datawrapper-chart-%chart_id%" src="%chart_url%" scrolling="no" frameborder="0" style="width: 0; min-width: 100% !important; border: none;" height="%chart_height%"></iframe>`
                    )
                }
            ];

            if (team && preferred === 'custom') {
                const customEmbed = get(team, 'settings.embed.custom_embed');
                templates.push({
                    id: 'custom',
                    preferred: true,
                    title: customEmbed.title,
                    template: getTemplate(customEmbed.template)
                });
            }
            return templates;

            function clean(s) {
                return sanitizeHtml(s, { allowedTags: [] })
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;');
            }

            function getTemplate(code) {
                return code
                    .replace(/%chart_title%/g, clean(chart.title))
                    .replace(/%chart_url%/g, chart.public_url)
                    .replace(/%chart_type%/g, ariaLabel)
                    .replace(/%chart_intro%/g, clean(get(chart, 'metadata.describe.intro')))
                    .replace(/%chart_width%/g, clean(get(chart, 'metadata.publish.embed-width')))
                    .replace(/%chart_height%/g, clean(get(chart, 'metadata.publish.embed-height')));
            }
        }
    });
};

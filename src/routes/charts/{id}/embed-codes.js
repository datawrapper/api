const { getUserData } = require('@datawrapper/orm/utils/userData');
const Boom = require('@hapi/boom');
const Joi = require('@hapi/joi');
const get = require('lodash/get');
const path = require('path');
const fs = require('fs-extra');
const { translate } = require('../../../utils/l10n');
const sanitizeHtml = require('sanitize-html');
const chartCore = require('@datawrapper/chart-core');

const { createResponseConfig } = require('../../../schemas/response');

module.exports = async (server, options) => {
    const embedJS = await fs.readFile(path.join(chartCore.path.dist, 'embed.js'), 'utf-8');
    // GET /v3/charts/{id}/embed-codes
    server.route({
        method: 'GET',
        path: '/embed-codes',
        options: {
            tags: ['api'],
            description: 'Get embed codes for a chart',
            notes: `Request the responsive and static embed code of a chart.`,
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
                    id: Joi.string()
                        .length(5)
                        .required()
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

            const __ = key => translate(key, { scope: 'core', language: auth.artifacts.language });

            let ariaLabel = translate('visualization', { scope: 'core', language: chart.language });

            if (server.app.visualizations.has(chart.type)) {
                const vis = server.app.visualizations.get(chart.type);

                ariaLabel = vis.ariaLabel
                    ? // preferably, use the defined aria-label eg "Interactive line chart"
                      translate(vis.ariaLabel, { scope: vis.__plugin, language: chart.language })
                    : vis.title
                    ? // otherwise fall back to the visualization title
                      translate(vis.title, { scope: vis.__plugin, language: chart.language })
                    : // as last resort just use chart|map|table
                      translate(vis.namespace || 'chart', {
                          scope: 'core',
                          language: chart.language
                      });
            }

            const team = await chart.getTeam();
            const preferred = auth.artifacts.id
                ? team && get(team, 'settings.embed.preferred_embed')
                    ? get(team, 'settings.embed.preferred_embed')
                    : await getUserData(auth.artifacts.id, 'embed_type', 'responsive')
                : 'responsive';

            const templates = [
                // responsive iframe
                {
                    id: 'responsive',
                    preferred: preferred === 'responsive',
                    title: __('publish / embed / responsive'),
                    ...getTemplate(
                        `<iframe title="%chart_title%" aria-label="%chart_type%" id="datawrapper-chart-%chart_id%" src="%chart_url%" scrolling="no" frameborder="0" style="width: 0; min-width: 100% !important; border: none;" height="%chart_height%"></iframe><script type="text/javascript">%embed_js%</script>`
                    )
                },
                // standard iframe
                {
                    id: 'iframe',
                    preferred: preferred === 'iframe',
                    title: __('publish / embed / iframe'),
                    ...getTemplate(
                        `<iframe title="%chart_title%" aria-label="%chart_type%" id="datawrapper-chart-%chart_id%" src="%chart_url%" scrolling="no" frameborder="0" style="border: none;" width="%chart_width%" height="%chart_height%"></iframe>`
                    )
                }
            ];

            if (team && preferred === 'custom') {
                const customEmbed = get(team, 'settings.embed.custom_embed');
                templates.push({
                    id: 'custom',
                    preferred: true,
                    title: customEmbed.title,
                    ...getTemplate(customEmbed.template)
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

            function getTemplate(template) {
                return {
                    template,
                    code: template
                        .replace(/%chart_id%/g, chart.id)
                        .replace(/%chart_public_version%/g, chart.public_version)
                        .replace(/%chart_url%/g, chart.public_url)
                        .replace(
                            /%chart_url_without_protocol%/g,
                            chart.public_url ? chart.public_url.replace('https:', '') : ''
                        )
                        .replace(/%chart_type%/g, ariaLabel)
                        .replace(/%chart_title%/g, clean(chart.title))
                        .replace(/%chart_intro%/g, clean(get(chart, 'metadata.describe.intro')))
                        .replace(/%embed_js%/g, embedJS)
                        .replace(
                            /%chart_width%/g,
                            clean(get(chart, 'metadata.publish.embed-width'))
                        )
                        .replace(
                            /%chart_height%/g,
                            clean(get(chart, 'metadata.publish.embed-height'))
                        )
                };
            }
        }
    });
};

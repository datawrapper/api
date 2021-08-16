const Boom = require('@hapi/boom');
const Joi = require('joi');
const get = require('lodash/get');
const chartCore = require('@datawrapper/chart-core');
const { compileCSS } = require('../../../publish/compile-css.js');
const set = require('lodash/set');

module.exports = (server, options) => {
    const styleCache = server.cache({
        segment: 'vis-styles',
        expiresIn: 86400000 * 365 /* 1 year */,
        shared: true
    });

    server.route({
        method: 'GET',
        path: '/styles.css',
        options: {
            auth: {
                mode: 'try'
            },
            validate: {
                query: Joi.object({
                    theme: Joi.string().default('datawrapper'),
                    transparent: Joi.boolean().optional().default(false)
                })
            }
        },
        handler: getVisualizationStyles
    });

    async function getVisualizationStyles(request, h) {
        const { query, params, server } = request;

        const vis = server.app.visualizations.get(params.id);
        if (!vis) return Boom.notFound();

        const { result: theme, statusCode: themeCode } = await server.inject({
            url: `/v3/themes/${query.theme}?extend=true`
        });

        if (themeCode !== 200) return Boom.badRequest(`Theme [${query.theme}] does not exist.`);

        const transparent = !!query.transparent;

        // try to find a .githead file in vis plugin
        const githead = vis.githead || 'head';

        const cacheKey = `${query.theme}__${params.id}__${githead}`;
        const cachedCSS = await styleCache.get(cacheKey);
        const cacheStyles = get(server.methods.config('general'), 'cache.styles', false);

        if (cacheStyles && !transparent && cachedCSS) {
            return h.response(`${cachedCSS}`).header('Content-Type', 'text/css');
        }

        if (transparent) {
            set(theme, 'data.style.body.background', 'transparent');
        }

        const filePaths = [chartCore.less, vis.less];

        if (chartCore.css) filePaths.push(chartCore.css);

        const css = await compileCSS({
            theme,
            filePaths
        });

        if (!transparent) {
            await styleCache.set(cacheKey, css);
        }

        return h.response(`${css}`).header('Content-Type', 'text/css');
    }
};

const path = require('path');
const fs = require('fs-extra');
const Boom = require('@hapi/boom');
const Joi = require('joi');
const get = require('lodash/get');
const chartCore = require('@datawrapper/chart-core');
const { createFontEntries, compileCSS } = require('../publish/compile-css.js');
const set = require('lodash/set');

module.exports = (server, options) => {
    const styleCache = server.cache({
        segment: 'vis-styles',
        expiresIn: 86400000 * 365 /* 1 year */,
        shared: true
    });

    server.route({
        method: 'GET',
        path: '/{id}/styles.css',
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

    server.route({
        method: 'GET',
        path: '/{id}/styles',
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
        const returnCombinedCSS = request.path.includes('styles.css');

        const vis = server.app.visualizations.get(params.id);
        if (!vis) return Boom.notFound();

        const { result: theme, statusCode: themeCode } = await server.inject({
            url: `/v3/themes/${query.theme}?extend=true`
        });

        if (themeCode !== 200) return Boom.badRequest(`Theme [${query.theme}] does not exist.`);

        const transparent = !!query.transparent;

        // try to find a .githead file in vis plugin
        const pluginRoot = get(
            server.methods.config('general'),
            'localPluginRoot',
            path.join(__dirname, '../../../../plugins')
        );
        const pluginGitHead = path.join(pluginRoot, vis.__plugin, '.githead');
        let githead = 'head';
        if (fs.existsSync(pluginGitHead)) {
            githead = await fs.readFile(pluginGitHead);
        }

        const cacheKey = `${query.theme}__${params.id}__${githead}`;
        const cachedCSS = await styleCache.get(cacheKey);
        const cacheStyles = get(server.methods.config('general'), 'cache.styles', false);
        const fonts = createFontEntries(theme.fonts, theme.data);

        if (cacheStyles && !transparent && cachedCSS) {
            if (returnCombinedCSS) {
                return h.response(`${fonts}\n\${cachedCSS}`).header('Content-Type', 'text/css');
            } else {
                return { css: cachedCSS, fonts };
            }
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

        if (returnCombinedCSS) {
            return h.response(`${fonts}\n${css}`).header('Content-Type', 'text/css');
        } else {
            return { css, fonts };
        }
    }
};

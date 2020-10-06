const fs = require('fs-extra');
const Boom = require('@hapi/boom');
const Joi = require('@hapi/joi');
const chartCore = require('@datawrapper/chart-core');

const { compileCSS } = require('../publish/compile-css.js');

module.exports = {
    name: 'routes/visualizations',
    version: '1.0.0',
    register
};

async function register(server, options) {
    server.app.scopes.add('visualization:read');

    const styleCache = server.cache({
        segment: 'vis-styles',
        expiresIn: 86400000 * 365 /* 1 year */,
        shared: true
    });

    server.route({
        method: 'GET',
        path: '/{id}',
        options: {
            auth: {
                mode: 'try',
                access: { scope: ['visualization:read'] }
            }
        },
        handler: getVisualization
    });

    async function getVisualization(request, h) {
        const { params, server } = request;

        const vis = server.app.visualizations.get(params.id);
        if (!vis) return Boom.notFound();

        return h.response(vis);
    }

    server.route({
        method: 'GET',
        path: '/{id}/styles.css',
        options: {
            auth: {
                mode: 'try',
                access: { scope: ['visualization:read'] }
            },
            validate: {
                query: Joi.object({
                    theme: Joi.string().default('datawrapper')
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

        const cacheKey = `${query.theme}__${params.id}`;
        const cachedCSS = await styleCache.get(cacheKey);
        const cacheStyles = server.methods.config('general.cache.styles', false);

        if (cacheStyles && cachedCSS) {
            return h.response(cachedCSS).header('Content-Type', 'text/css');
        }

        const css = await compileCSS({
            theme,
            filePaths: [chartCore.less, vis.less]
        });

        await styleCache.set(cacheKey, css);

        return h.response(css).header('Content-Type', 'text/css');
    }

    server.route({
        method: 'GET',
        path: '/{id}/script.js',
        options: {
            auth: {
                mode: 'try',
                access: { scope: ['visualization:read'] }
            }
        },
        handler: getVisualizationScript
    });

    async function getVisualizationScript(request, h) {
        const { params, server } = request;

        const { result, statusCode } = await server.inject({
            url: `/v3/visualizations/${params.id}`,
            validate: false
        });

        if (statusCode !== 200) {
            return new Boom(result.message, result);
        }

        const file = result.script;
        const { mtime } = await fs.stat(file);

        /* https://hapi.dev/api/?v=19.1.1#-hentityoptions */
        const response = h.entity({ modified: mtime });

        if (response) return response;

        const stream = fs.createReadStream(file, { encoding: 'utf-8' });
        return h.response(stream).header('Content-Type', 'application/javascript');
    }
}

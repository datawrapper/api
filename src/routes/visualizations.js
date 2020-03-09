const fs = require('fs-extra');
const Boom = require('@hapi/boom');
const Joi = require('@hapi/joi');
const chartCore = require('@datawrapper/chart-core');

const { compileCSS } = require('../publish/compile-css.js');

module.exports = {
    name: 'visualization-routes',
    version: '1.0.0',
    register
};

async function register(server, options) {
    server.app.visualizations = new Map();
    server.method('registerVisualization', registerVisualization);

    function registerVisualization(plugin, visualizations = []) {
        visualizations.forEach(vis => {
            const visualization = server.app.visualizations.get(vis.id);

            if (visualization) {
                server
                    .logger()
                    .warn(
                        { status: 'skipping', registeredBy: plugin },
                        `[Visualization] "${vis.id}" already registered.`
                    );
                return;
            }

            vis.__plugin = plugin;
            vis.libraries = vis.libraries || [];
            server.app.visualizations.set(vis.id, vis);
        });
    }

    server.route({
        method: 'GET',
        path: '/{id}',
        options: {
            auth: {
                mode: 'try'
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
                mode: 'try'
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

        const css = await compileCSS({
            theme,
            filePaths: [chartCore.less, vis.less]
        });

        return h.response(css).header('Content-Type', 'text/css');
    }

    server.route({
        method: 'GET',
        path: '/{id}/script.js',
        options: {
            auth: {
                mode: 'try'
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

const path = require('path');
const fs = require('fs');
const { promisify } = require('util');
const Boom = require('@hapi/boom');
const Joi = require('@hapi/joi');
const got = require('got');

const stat = promisify(fs.stat);

const { compileCSS } = require('../publish/compile-css');

const corePath = path.dirname(require.resolve('@datawrapper/chart-core/package.json'));

module.exports = {
    name: 'visualization-routes',
    version: '1.0.0',
    register: async (server, options) => {
        const vizCache = server.cache({
            expiresIn: 10 * 1000,
            segment: 'vizSegment'
        });

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

        async function getVisualization(request, h) {
            const { params, server } = request;
            const { api } = server.methods.config();
            const url = `visualizations/${params.id}`;
            let responseData = await vizCache.get(url);
            try {
                if (!responseData) {
                    const { data } = await got(url, {
                        prefixUrl: `${api.https ? 'https' : 'http'}://${api.domain}`
                    }).json();

                    responseData = data;
                    await vizCache.set(url, responseData);
                }
            } catch (error) {
                request.logger.error(error);
                return Boom.notFound();
            }

            const { options, annotate_options, workflow, icon, ...data } = responseData;

            data.lessDirectory = path.dirname(data.less.split(`${data.__plugin}/`).pop());
            data.lessFile = data.less.split('/').pop();
            data.libraries = data.libraries || [];

            return h.response(data);
        }

        async function getVisualizationStyles(request, h) {
            const { query, params, server } = request;
            const { general } = server.methods.config();

            const [
                { result: vis, statusCode: visCode },
                { result: theme, statusCode: themeCode }
            ] = await Promise.all([
                server.inject({ url: `/v3/visualizations/${params.id}` }),
                server.inject({ url: `/v3/themes/${query.theme}?extend=true` })
            ]);

            if (visCode !== 200) return Boom.notFound();
            if (themeCode !== 200) return Boom.badRequest(`Theme [${query.theme}] does not exist.`);

            const fonts = Object.entries(theme.assets).reduce((fonts, [key, value]) => {
                if (theme.assets[key].type === 'font') fonts[key] = value;
                return fonts;
            }, {});

            const visLessPath = path.join(
                path.join(general.localPluginRoot, vis.__plugin),
                vis.lessDirectory
            );

            const filePaths = [
                path.join(corePath, 'lib', 'styles.less'),
                path.join(visLessPath, vis.lessFile)
            ];

            const css = await compileCSS({
                fonts,
                theme,
                filePaths,
                paths: [visLessPath]
            });

            return h.response(css).header('Content-Type', 'text/css');
        }

        async function getVisualizationScript(request, h) {
            const { params, server } = request;
            const { localPluginRoot } = server.methods.config('general');

            const { result, statusCode } = await server.inject({
                url: `/v3/visualizations/${params.id}`,
                validate: false
            });

            if (statusCode !== 200) {
                return new Boom(result.message, result);
            }

            const file = path.join(localPluginRoot, result.__plugin, 'static', `${result.id}.js`);
            const { mtime } = await stat(file);

            const response = h.entity({ modified: mtime });

            if (response) {
                return response;
            }

            const stream = fs.createReadStream(file, { encoding: 'utf-8' });
            return h.response(stream).header('Content-Type', 'application/javascript');
        }
    }
};

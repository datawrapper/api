const get = require('lodash/get');
const { translate } = require('@datawrapper/service-utils/l10n');

module.exports = {
    name: 'routes/visualizations',
    version: '1.0.0',
    register(server) {
        server.route({
            method: 'GET',
            path: '/',
            options: {
                description: 'Get list of all available visualization types',
                auth: {
                    mode: 'try',
                    access: { scope: ['visualization:read'] }
                }
            },
            handler: getVisualizations
        });

        function getVisualizations(request, h) {
            const { server, auth } = request;

            return Array.from(server.app.visualizations.keys())
                .map(key => {
                    const vis = server.app.visualizations.get(key);
                    vis.__title = translate(vis.title, {
                        scope: vis.__plugin,
                        language: get(auth.artifacts, 'language') || 'en-US'
                    });
                    return vis;
                })
                .filter(vis => !vis.hidden);
        }

        server.register(require('./{id}'), {
            routes: {
                prefix: '/{id}'
            }
        });
    }
};

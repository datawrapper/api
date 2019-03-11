module.exports = {
    name: 'routes',
    version: '1.0.0',
    register: (server, options) => {
        server.route({
            method: 'GET',
            path: '/',
            config: {
                tags: ['api'],
                auth: false
            },
            handler: (request, h) => h.redirect('v3/open-api.json')
        });

        server.register(require('./users'), {
            routes: {
                prefix: '/users'
            }
        });

        server.register(require('./auth'), {
            routes: {
                prefix: '/auth'
            }
        });
    }
};

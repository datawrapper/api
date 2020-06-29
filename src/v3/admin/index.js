module.exports = {
    name: 'routes/admin',
    version: '1.0.0',
    register(server, options) {
        server.register(require('./plugins'), {
            routes: {
                prefix: '/plugins'
            }
        });

        server.register(require('./teams'), {
            routes: {
                prefix: '/teams'
            }
        });
    }
};

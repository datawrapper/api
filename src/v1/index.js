module.exports = {
    name: 'v1-routes',
    version: '1.0.0',
    register: (server, options) => {
        server.register(require('./plugin/login-token'), {
            routes: {
                prefix: '/plugin/login-token'
            }
        });
    }
};

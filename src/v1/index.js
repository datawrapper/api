module.exports = {
    name: 'v1-routes',
    version: '1.0.0',
    register: (server, options) => {
        server.register(require('./login-tokens'), {
            routes: {
                prefix: '/plugin/login-tokens'
            }
        });
    }
};

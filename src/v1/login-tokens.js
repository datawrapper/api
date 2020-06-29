module.exports = {
    name: 'v1-routes/login-tokens',
    version: '1.0.0',
    register: async (server, options) => {
        // POST /plugin/login-tokens
        server.route({
            method: 'POST',
            path: '/',
            options: {
                tags: ['api']
            },
            handler: (request, h) => {
                return 'hello world';
            }
        });

        // POST /plugin/login-tokens/{chartId}/{step}

        // GET /plugin/login-tokens/{token}
    }
};

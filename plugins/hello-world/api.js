module.exports = {
    name: 'hello-world',
    version: '1.0.0',
    register: (server, options) => {
        server.route({
            method: 'GET',
            path: '/hello-world',
            config: { auth: false, tags: ['api', 'plugin'] },
            handler: (request, h) => {
                return { data: 'Hello from plugin' };
            }
        });
    }
};

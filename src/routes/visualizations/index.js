module.exports = {
    name: 'routes/visualizations',
    version: '1.0.0',
    register(server) {
        server.register(require('./{id}'), {
            routes: {
                prefix: '/{id}'
            }
        });
    }
};

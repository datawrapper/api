const { Product } = require('@datawrapper/orm/models');

module.exports = {
    name: 'products-routes',
    version: '1.0.0',
    register: (server, options) => {
        server.route({
            method: 'GET',
            path: '/',
            options: {
                tags: ['api']
            },
            handler: async function getAllFolders(request, h) {
                request.server.methods.isAdmin(request, { throwError: true });
                return Product.findAll().map(el => {
                    el.data = JSON.parse(el.data);
                    return el;
                });
            }
        });
    }
};

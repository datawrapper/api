const { Product } = require('@datawrapper/orm/models');

module.exports = {
    name: 'products-routes',
    version: '1.0.0',
    register: (server, options) => {
        server.route({
            method: 'GET',
            path: '/',
            handler: async function getAllProducts(request, h) {
                request.server.methods.isAdmin(request, { throwError: true });

                const { rows, count } = await Product.findAndCountAll();

                return {
                    list: rows.map(product => {
                        product.data = JSON.parse(product.data);
                        return product;
                    }),
                    total: count
                };
            }
        });
    }
};

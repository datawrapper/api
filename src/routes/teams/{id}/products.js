const Joi = require('@hapi/joi');
const Boom = require('@hapi/boom');
const { Team, TeamProduct, Product } = require('@datawrapper/orm/models');

module.exports = async (server, options) => {
    // GET /v3/teams/{id}/products
    server.route({
        method: 'GET',
        path: '/products',
        options: {
            auth: {
                access: { scope: ['team', 'all'] }
            },
            validate: {
                params: {
                    id: Joi.string()
                        .required()
                        .description('ID of the team to fetch products for.')
                }
            }
        },
        async handler(request, h) {
            const { auth, params } = request;
            const user = auth.artifacts;

            if (!user || !user.mayAdministrateTeam(params.id)) {
                return Boom.unauthorized();
            }

            const team = await Team.findByPk(params.id, {
                attributes: ['id'],
                include: [
                    {
                        model: Product,
                        attributes: ['id', 'name']
                    }
                ]
            });

            const products = team.products.map(product => ({
                id: product.id,
                name: product.name,
                expires: product.team_product.expires
            }));

            return {
                list: products,
                total: products.length
            };
        }
    });

    // POST /v3/teams/{id}/products
    server.route({
        method: 'POST',
        path: '/products',
        options: {
            auth: {
                access: { scope: ['team', 'all'] }
            },
            validate: {
                params: {
                    id: Joi.string()
                        .required()
                        .description('ID of the team to create the product for.')
                },
                payload: {
                    expires: Joi.date()
                        .allow(null)
                        .optional(),
                    productId: Joi.number()
                }
            }
        },
        async handler(request, h) {
            const { server, payload, params } = request;
            server.methods.isAdmin(request, { throwError: true });

            const hasProduct = !!(await TeamProduct.findOne({
                where: {
                    organization_id: params.id,
                    productId: payload.productId
                }
            }));

            if (hasProduct) {
                return Boom.badRequest('This product is already associated to this team.');
            }

            const teamProduct = await TeamProduct.create({
                organization_id: params.id,
                productId: payload.productId,
                expires: payload.expires || null,
                created_by_admin: true
            });

            const team = await Team.findByPk(params.id);
            await team.invalidatePluginCache();

            return h.response(teamProduct).code(201);
        }
    });

    // PUT /v3/teams/{id}/products/{productId}
    server.route({
        method: 'PUT',
        path: '/products/{productId}',
        options: {
            auth: {
                access: { scope: ['team', 'all'] }
            },
            validate: {
                params: {
                    id: Joi.string()
                        .required()
                        .description('ID of the team.'),
                    productId: Joi.number()
                        .required()
                        .description('ID of the product.')
                },
                payload: {
                    expires: Joi.date()
                        .allow(null)
                        .optional()
                }
            }
        },
        handler: async function updateTeamProduct(request, h) {
            const { server, payload, params } = request;
            server.methods.isAdmin(request, { throwError: true });

            const teamProduct = await TeamProduct.findOne({
                where: {
                    organization_id: params.id,
                    product_id: params.productId
                }
            });

            if (!teamProduct) {
                return Boom.notFound('This product is not associated to this team.');
            }

            await teamProduct.update({
                expires: payload.expires
            });

            const team = await Team.findByPk(params.id);
            await team.invalidatePluginCache();

            return h.response().code(204);
        }
    });

    // DELETE /v3/teams/{id}/products/{productId}
    server.route({
        method: 'DELETE',
        path: '/products/{productId}',
        options: {
            auth: {
                access: { scope: ['team', 'all'] }
            },
            validate: {
                params: {
                    id: Joi.string()
                        .required()
                        .description('ID of the team.'),
                    productId: Joi.number()
                        .required()
                        .description('ID of the product.')
                }
            }
        },
        async handler(request, h) {
            const { server, params } = request;
            const isAdmin = server.methods.isAdmin(request);

            if (!isAdmin) {
                return Boom.unauthorized();
            }

            const deleteCount = await TeamProduct.destroy({
                where: {
                    organization_id: params.id,
                    product_id: params.productId
                }
            });

            if (!deleteCount) {
                return Boom.notFound('This product is not associated to this team.');
            }

            const team = await Team.findByPk(params.id);
            await team.invalidatePluginCache();

            return h.response().code(204);
        }
    });
};

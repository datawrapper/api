const Joi = require('@hapi/joi');

module.exports = {
    name: 'v1-routes/login-tokens',
    version: '1.0.0',
    register: async (server, options) => {
        // GET /plugin/login-tokens/{token}
        server.route({
            method: 'GET',
            path: '/{token}',
            options: {
                tags: ['api'],
                auth: false,
                validate: {
                    params: Joi.object({
                        token: Joi.string()
                            .required()
                            .description('A valid login token.')
                    })
                }
            },
            handler: (request, h) => {
                const { params, server } = request;
                const { api } = server.methods.config();

                return h.redirect(
                    `${api.https ? 'https' : 'http'}://${api.subdomain}.${
                        api.domain
                    }/v3/auth/login-tokens/${params.token}`
                );
            }
        });

        // POST /plugin/login-tokens
        server.route({
            method: 'POST',
            path: '/',
            options: {
                tags: ['api']
            },
            handler: async (request, h) => {
                const res = await request.server.inject({
                    method: 'POST',
                    url: `/v3/auth/login-tokens`,
                    auth: request.auth
                });

                return {
                    status: 'ok',
                    data: {
                        redirect_url: res.result.redirect_url
                    }
                };
            }
        });

        // POST /plugin/login-tokens/{chartId}/{step}
        server.route({
            method: 'POST',
            path: '/{chartId}/{step}',
            options: {
                tags: ['api'],
                validate: {
                    params: Joi.object({
                        chartId: Joi.string()
                            .length(5)
                            .required()
                            .description('A chart ID.'),
                        step: Joi.string()
                            .required()
                            .allow(
                                'basemap',
                                'data',
                                'upload',
                                'describe',
                                'visualize',
                                'publish',
                                'preview'
                            )
                            .description('A step in the chart editor.')
                    })
                }
            },
            handler: async (request, h) => {
                const { params } = request;

                /* params.step is deliberately ignored
                 * as we don't support it anymore in v3 */
                const payload = {
                    chartId: params.chartId
                };

                const res = await request.server.inject({
                    method: 'POST',
                    url: `/v3/auth/login-tokens`,
                    auth: request.auth,
                    payload
                });

                return {
                    status: 'ok',
                    data: {
                        redirect_url: res.result.redirect_url
                    }
                };
            }
        });
    }
};

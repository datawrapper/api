const Boom = require('@hapi/boom');
const Joi = require('@hapi/joi');
const { AccessToken } = require('@datawrapper/orm/models');
const { createSession, getStateOpts } = require('../../auth/utils');

module.exports = async (server, options) => {
    server.route({
        method: 'GET',
        path: '/login-tokens/{token}',
        options: {
            auth: false,
            validate: {
                params: Joi.object({
                    token: Joi.string()
                        .required()
                        .description('A valid login token.')
                })
            }
        },
        async handler(request, h) {
            const { params } = request;

            const token = await AccessToken.findOne({
                where: {
                    type: 'login-token',
                    token: params.token
                }
            });

            if (!token) return Boom.notFound();

            // token found, create a session
            await AccessToken.destroy({
                where: {
                    type: 'login-token',
                    token: params.token
                }
            });

            const { generateToken, config } = request.server.methods;
            const { api, frontend } = config();
            const session = await createSession(generateToken(), token.user_id, false);

            return h
                .response({
                    [api.sessionID]: session.id
                })
                .state(api.sessionID, session.id, getStateOpts(api.domain, 30))
                .redirect(
                    `${frontend.https ? 'https' : 'http'}://${frontend.domain}${
                        token.data.redirect_url
                    }`
                );
        }
    });

    server.route({
        method: 'POST',
        path: '/login-tokens',
        options: {
            tags: ['api'],
            description: 'Creates a login token',
            notes: 'Creates a new login token to authenticate a user.',
            auth: {
                access: { scope: ['auth:write'] }
            },
            validate: {
                payload: Joi.object({
                    chartId: Joi.string()
                        .length(5)
                        .required()
                        .description('A chart ID.')
                })
                    .optional()
                    .allow(null)
            }
        },
        async handler(request, h) {
            const { auth, payload, server } = request;
            const { api } = server.methods.config();

            if (!auth.artifacts.isActivated()) {
                // only activated users may create login tokens
                return Boom.unauthorized('You need to activate your account first');
            }

            let redirectUrl;

            if (payload && payload.chartId) {
                const chart = await server.methods.loadChart(payload.chartId);

                /* this check isn't strictly necessary for security reasons
                 * as the token is only valid for the user, but still can't hurt */
                const isEditable = await chart.isEditableBy(
                    auth.artifacts,
                    auth.credentials.session
                );

                if (!isEditable) {
                    return Boom.forbidden();
                }

                redirectUrl = `/chart/${chart.id}/edit`;
            }

            const token = await AccessToken.newToken({
                type: 'login-token',
                user_id: auth.artifacts.id,
                data: {
                    redirect_url: redirectUrl
                }
            });

            return h
                .response({
                    id: token.id,
                    token: token.token,
                    redirect_url: `${api.https ? 'https' : 'http'}://${api.subdomain}.${
                        api.domain
                    }/v3/auth/login-tokens/${token.token}`
                })
                .code(201);
        }
    });

    server.route({
        method: 'DELETE',
        path: '/login-tokens/{token}',
        options: {
            tags: ['api'],
            description: 'Deletes a login token',
            notes: 'Deletes an existing login token by the current user.',
            auth: {
                access: { scope: ['auth:write'] }
            },
            validate: {
                params: Joi.object({
                    token: Joi.string()
                        .required()
                        .description('A valid login token.')
                })
            }
        },
        async handler(request, h) {
            const { params, auth } = request;

            await AccessToken.destroy({
                where: {
                    type: 'login-token',
                    token: params.token,
                    user_id: auth.artifacts.id
                }
            });

            return h.response().code(204);
        }
    });
};

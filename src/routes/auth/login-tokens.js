const Boom = require('@hapi/boom');
const Joi = require('@hapi/joi');

module.exports = async (server, options) => {
    const { models } = options;
    const { AccessToken } = models;

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
            const { login } = request.server.methods;
            const { api, frontend } = request.server.methods.config();
            const { sessionID, opts } = await login({
                request,
                userId: token.user_id,
                keepSession: false,
                sameSite: 'None'
            });

            await AccessToken.destroy({
                where: {
                    type: 'login-token',
                    token: params.token
                }
            });

            return h
                .response({
                    [api.sessionID]: sessionID
                })
                .state(api.sessionID, sessionID, opts)
                .redirect(
                    `${frontend.https ? 'https' : 'http'}://${frontend.domain}${
                        token.data.redirect_uri
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
                        .description('A chart ID.'),
                    step: Joi.string()
                        .description('An edit step in the visualization editor.')
                        .required()
                        .valid(
                            'basemap',
                            'data',
                            'upload',
                            'describe',
                            'visualize',
                            'publish',
                            'preview'
                        )
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

            let redirectUri;

            if (payload && payload.chartId && payload.step) {
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

                redirectUri = `/chart/${chart.id}/${payload.step}`;
            }

            const token = await AccessToken.newToken({
                type: 'login-token',
                user_id: auth.artifacts.id,
                data: {
                    redirect_uri: redirectUri
                }
            });

            return h
                .response({
                    id: token.id,
                    token: token.token,
                    redirect_uri: `${api.https ? 'https' : 'http'}://${api.subdomain}.${
                        api.domain
                    }/v3/login-tokens/${token.token}`
                })
                .code(201);
        }
    });
};

const Boom = require('@hapi/boom');
const Joi = require('@hapi/joi');
const { AccessToken } = require('@datawrapper/orm/models');

module.exports = async (server, options) => {
    server.route({
        method: 'POST',
        path: '/login-tokens',
        options: {
            tags: ['api'],
            description: 'Creates a login token',
            notes: 'Creates a new login token to authenticate a user, for use in CMS integrations.',
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
                        .required()
                        .optional()
                        .valid(
                            'edit',
                            'upload',
                            'describe',
                            'visualize',
                            'publish',
                            'basemap',
                            'data',
                            'makers',
                            'design',
                            'annotate',
                            'preview'
                        )
                        .default('edit')
                        .description('An edit step in the chart editor.')
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

                redirectUrl = `/chart/${chart.id}/${payload.step}`;
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
                    }/v3/auth/login/${token.token}`
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

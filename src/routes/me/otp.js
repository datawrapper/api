const Boom = require('@hapi/boom');
const Joi = require('@hapi/joi');
const otpProviders = require('../../auth/otp');

const { noContentResponse } = require('../../schemas/response');

module.exports = async (server, options) => {
    server.route({
        method: 'GET',
        path: '/otp',
        options: {
            description: 'Get list of supported OTP providers',
            notes: `Requires scope \`user:read\`.`,
            auth: {
                access: { scope: ['user:read'] }
            },
            validate: {}
        },
        async handler(request, h) {
            const { auth } = request;
            const { config } = request.server.methods;

            const res = [];
            for (var i = 0; i < otpProviders.length; i++) {
                const otpProvider = otpProviders[i];
                const installed = !!otpProvider.isEnabled({ config });
                const enabled = !!(await otpProvider.isEnabledForUser({ user: auth.artifacts }));
                if (installed || auth.artifacts.isAdmin()) {
                    res.push({
                        id: otpProvider.id,
                        title: otpProvider.title,
                        installed,
                        enabled,
                        data: otpProvider.data ? otpProvider.data() : {}
                    });
                }
            }

            return res;
        }
    });
    // POST /v3/me/otp/{provider}
    server.route({
        method: 'POST',
        path: '/otp/{provider}',
        options: {
            description: 'Enable OTP for user login',
            notes: `Requires scope \`user:write\`.`,
            auth: {
                access: { scope: ['user:write'] }
            },
            validate: {
                params: {
                    provider: Joi.string()
                        .required()
                        .valid(...otpProviders.map(p => p.id))
                        .description('Valid OTP provider id (e.g., `yubikey`')
                },
                payload: Joi.object({
                    otp: Joi.string().required().description('A valid OTP')
                })
            },
            response: noContentResponse
        },
        async handler(request, h) {
            const { auth, params } = request;
            const { config } = request.server.methods;
            const { otp } = request.payload;

            const otpProvider = otpProviders.find(p => p.id === params.provider);
            if (!otpProvider) return Boom.badRequest('Unkown OTP provider');

            if (!otpProvider.isEnabled({ config })) {
                return Boom.badRequest('This OTP provider is not configured');
            }

            await otpProvider.enable({ user: auth.artifacts, config, otp });
            return h.response().code(204);
        }
    });
    // DELETE /v3/me/otp/{provider}
    server.route({
        method: 'DELETE',
        path: '/otp/{provider}',
        options: {
            description: 'Disable OTP for user login',
            notes: `Requires scope \`user:write\`.`,
            auth: {
                access: { scope: ['user:write'] }
            },
            validate: {
                params: {
                    provider: Joi.string()
                        .required()
                        .valid(...otpProviders.map(p => p.id))
                        .description('Valid OTP provider id (e.g., `yubikey`')
                }
            },
            response: noContentResponse
        },
        async handler(request, h) {
            const { auth, params } = request;
            const { config } = request.server.methods;

            const otpProvider = otpProviders.find(p => p.id === params.provider);
            if (!otpProvider) return Boom.badRequest('Unkown OTP provider');

            if (!otpProvider.isEnabled({ config })) {
                return Boom.badRequest('This OTP provider is not configured');
            }

            await otpProvider.disable({ user: auth.artifacts });
            return h.response().code(204);
        }
    });
};

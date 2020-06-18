const Joi = require('@hapi/joi');
const { createResponseConfig } = require('../../schemas/response');

module.exports = async (server, options) => {
    // PATCH /v3/me/data
    server.route({
        method: 'PATCH',
        path: '/data',
        options: {
            description: 'Update your account data',
            auth: {
                access: { scope: ['user', 'all'] }
            },
            validate: {
                payload: Joi.object()
            },
            response: createResponseConfig({
                schema: Joi.object({
                    updatedAt: Joi.date()
                }).unknown()
            })
        },
        async handler(request, h) {
            const res = await request.server.inject({
                method: 'PATCH',
                url: `/v3/users/${request.auth.artifacts.id}/data`,
                auth: request.auth,
                payload: request.payload
            });

            return h.response(res.result).code(res.statusCode);
        }
    });
};

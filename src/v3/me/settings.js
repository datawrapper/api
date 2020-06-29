const Joi = require('@hapi/joi');
const { createResponseConfig } = require('../../schemas/response');

module.exports = async (server, options) => {
    server.route({
        method: 'PATCH',
        path: '/settings',
        options: {
            tags: ['api'],
            description: 'Update your account settings',
            auth: {
                access: { scope: ['user:write'] }
            },
            notes: 'Use this endpoint to change your active team.',
            validate: {
                payload: {
                    activeTeam: Joi.string()
                        .allow(null)
                        .example('teamxyz')
                        .description('Your active team')
                }
            },
            response: createResponseConfig({
                schema: Joi.object({
                    activeTeam: Joi.string(),
                    updatedAt: Joi.date()
                }).unknown()
            })
        },
        async handler(request, h) {
            const res = await request.server.inject({
                method: 'PATCH',
                url: `/v3/users/${request.auth.artifacts.id}/settings`,
                auth: request.auth,
                payload: request.payload
            });

            return h.response(res.result).code(res.statusCode);
        }
    });
};

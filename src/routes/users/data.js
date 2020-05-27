const { setUserData, unsetUserData } = require('@datawrapper/orm/utils/userData');
const Boom = require('@hapi/boom');
const Joi = require('@hapi/joi');

const { createResponseConfig } = require('../../schemas/response');

module.exports = async (server, options) => {
    server.route({
        method: 'PATCH',
        path: '/{id}/data',
        options: {
            description: 'Update user data',
            validate: {
                params: {
                    id: Joi.number()
                        .required()
                        .description('User ID')
                },
                payload: Joi.object().description('Generic user data')
            },
            response: createResponseConfig({
                schema: Joi.object({
                    updatedAt: Joi.date()
                }).unknown()
            })
        },
        async handler(request, h) {
            const { auth, params } = request;
            const userId = params.id;
            await request.server.methods.userIsDeleted(userId);

            if (userId !== auth.artifacts.id) {
                request.server.methods.isAdmin(request, { throwError: true });
            }

            // for setting genereric settings
            if (request.payload !== undefined) {
                const keys = Object.keys(request.payload);
                for (let i = 0; i < keys.length; i++) {
                    const key = keys[i];
                    if (/^[a-z0-9_-]+$/.test(key)) {
                        if (request.payload[key] === null) {
                            await unsetUserData(userId, key);
                        } else {
                            await setUserData(userId, key, request.payload[key]);
                        }
                    } else {
                        return Boom.badRequest(
                            'user data keys must only contain letters, numbers, _ and -'
                        );
                    }
                }
            }

            const updatedAt = new Date().toISOString();

            return {
                updatedAt
            };
        }
    });
};

const Joi = require('@hapi/joi');
const get = require('lodash/get');

const { createResponseConfig, noContentResponse } = require('../schemas/response.js');

const meResponse = createResponseConfig({
    schema: Joi.object({
        id: Joi.number(),
        email: Joi.string(),
        name: Joi.string().allow(null),
        language: Joi.string()
    }).unknown()
});

module.exports = {
    name: 'me-routes',
    version: '1.0.0',
    register: (server, options) => {
        server.route({
            method: 'GET',
            path: '/',
            options: {
                tags: ['api'],
                description: 'Fetch your account information',
                response: meResponse
            },
            handler: getMe
        });

        server.route({
            method: 'PATCH',
            path: '/',
            options: {
                tags: ['api'],
                description: 'Update your account information',
                validate: {
                    payload: Joi.object({
                        name: Joi.string()
                            .allow(null)
                            .example('Ronin')
                            .description('Your new user name.'),
                        email: Joi.string()
                            .email()
                            .example('ronin@avengers.com')
                            .description('Your new email address.'),
                        role: Joi.string()
                            .valid('editor', 'admin')
                            .description(
                                'Your new role. This can only be changed if you are an admin.'
                            ),
                        language: Joi.string()
                            .example('en_US')
                            .description('Your new language preference.')
                    })
                },
                response: meResponse
            },
            handler: updateMe
        });

        server.route({
            method: 'PATCH',
            path: '/settings',
            options: {
                tags: ['api'],
                description: 'Update your account settings',
                notes: 'Use this endpoint to change your active team.',
                validate: {
                    payload: Joi.object({
                        activeTeam: Joi.string()
                            .allow(null)
                            .example('teamxyz')
                            .description('Your active team')
                    })
                },
                response: createResponseConfig({
                    schema: Joi.object({
                        activeTeam: Joi.string(),
                        updatedAt: Joi.date()
                    }).unknown()
                })
            },
            handler: updateMySettings
        });

        server.route({
            method: 'DELETE',
            path: '/',
            options: {
                tags: ['api'],
                description: 'Delete your account',
                notes: `**Be careful!** This is a destructive action.
                        By deleting your account you will loose access to all of your charts.
                        If this endpoint should be used in an application (CMS), it is recommended to
                        ask the user for confirmation.`,
                validate: {
                    payload: Joi.object({
                        email: Joi.string()
                            .email()
                            .example('zola@hydra.com')
                            .description('User email address to confirm deletion.')
                    })
                },
                response: noContentResponse
            },
            handler: deleteMe
        });
    }
};

async function getMe(request, h) {
    if (request.auth.artifacts.role === 'guest') {
        return {
            role: request.auth.artifacts.role,
            language: get(
                request,
                ['auth', 'credentials', 'data', 'data', 'dw-lang'],
                'en-US'
            ).replace('-', '_')
        };
    }

    const res = await request.server.inject({
        method: 'GET',
        url: `/v3/users/${request.auth.artifacts.id}`,
        auth: request.auth
    });
    return h.response(res.result).code(res.statusCode);
}

async function updateMe(request, h) {
    const res = await request.server.inject({
        method: 'PATCH',
        url: `/v3/users/${request.auth.artifacts.id}`,
        auth: request.auth,
        payload: request.payload
    });

    return h.response(res.result).code(res.statusCode);
}

async function updateMySettings(request, h) {
    const res = await request.server.inject({
        method: 'PATCH',
        url: `/v3/users/${request.auth.artifacts.id}/settings`,
        auth: request.auth,
        payload: request.payload
    });

    return h.response(res.result).code(res.statusCode);
}

async function deleteMe(request, h) {
    const res = await request.server.inject({
        method: 'DELETE',
        url: `/v3/users/${request.auth.artifacts.id}`,
        auth: request.auth,
        payload: request.payload
    });

    const { sessionID } = request.server.methods.config('api');

    return h
        .response(res.result)
        .code(res.statusCode)
        .unstate(sessionID);
}

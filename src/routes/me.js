const Joi = require('joi');
const get = require('lodash/get');

module.exports = {
    name: 'me-routes',
    version: '1.0.0',
    register: (server, options) => {
        server.route({
            method: 'GET',
            path: '/',
            options: {
                tags: ['api']
            },
            handler: getMe
        });

        server.route({
            method: 'PATCH',
            path: '/',
            options: {
                tags: ['api'],
                validate: {
                    payload: {
                        name: Joi.string()
                            .allow(null)
                            .example('Ronin')
                            .description('Your new user name.'),
                        email: Joi.string()
                            .email()
                            .example('ronin@avengers.com')
                            .description('Your new email address.'),
                        role: Joi.string()
                            .valid(['editor', 'admin'])
                            .description(
                                'Your new role. This can only be changed if you are an admin.'
                            ),
                        language: Joi.string()
                            .example('en_US')
                            .description('Your new language preference.')
                    }
                }
            },
            handler: updateMe
        });

        server.route({
            method: 'DELETE',
            path: '/',
            options: {
                tags: ['api'],
                validate: {
                    payload: {
                        email: Joi.string()
                            .email()
                            .example('zola@hydra.com')
                            .description('User email address to confirm deletion.')
                    }
                }
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

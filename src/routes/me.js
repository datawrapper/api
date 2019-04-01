const Joi = require('joi');

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
                        name: Joi.string().allow(null),
                        email: Joi.string().email(),
                        role: Joi.string().valid(['editor', 'admin']),
                        language: Joi.string()
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
                        email: Joi.string().email()
                    }
                }
            },
            handler: deleteMe
        });
    }
};

async function getMe(request, h) {
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

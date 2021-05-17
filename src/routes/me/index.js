const Boom = require('@hapi/boom');
const Joi = require('@hapi/joi');
const get = require('lodash/get');

const { createResponseConfig, noContentResponse } = require('../../schemas/response.js');

const meResponse = createResponseConfig({
    schema: Joi.object({
        id: Joi.number(),
        email: Joi.string(),
        name: Joi.string().allow(null),
        language: Joi.string()
    }).unknown()
});

module.exports = {
    name: 'routes/me',
    version: '1.0.0',
    register: (server, options) => {
        // GET /v3/me
        server.route({
            method: 'GET',
            path: '/',
            options: {
                tags: ['api'],
                auth: {
                    access: { scope: ['user:read'] }
                },
                description: 'Fetch your account information',
                notes: `Requires scope \`user:read\`.`,
                response: meResponse
            },
            handler: getMe
        });

        // PATCH /v3/me
        server.route({
            method: 'PATCH',
            path: '/',
            options: {
                tags: ['api'],
                auth: {
                    access: { scope: ['user:write'] }
                },
                description: 'Update your account information',
                notes: `Requires scope \`user:write\`.`,
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
                            .description('Your new language preference.'),
                        password: Joi.string()
                            .min(8)
                            .example('13-binary-1968')
                            .description('Strong user password.'),
                        oldPassword: Joi.string().description('The previous user password.')
                    })
                },
                response: meResponse
            },
            handler: updateMe
        });

        require('./settings')(server, options);
        require('./data')(server, options);
        require('./otp')(server, options);

        // DELETE /v3/me
        server.route({
            method: 'DELETE',
            path: '/',
            options: {
                tags: ['api'],
                auth: {
                    access: { scope: ['user:write'] }
                },
                description: 'Delete your account',
                notes: `**Be careful!** This is a destructive action.
                        By deleting your account you will loose access to all of your charts.
                        If this endpoint should be used in an application (CMS), it is recommended to
                        ask the user for confirmation. Requires scope \`user:write\`.`,
                validate: {
                    payload: Joi.object({
                        email: Joi.string()
                            .email()
                            .example('zola@hydra.com')
                            .description('User email address to confirm deletion.'),
                        password: Joi.string()
                            .required()
                            .description('User password to confirm deletion')
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
    if (request.auth.artifacts.role === 'guest' && request.payload.language) {
        if (!/[a-z]{2}-[a-z]{2}/i.test(request.payload.language)) {
            return Boom.badRequest('Invalid language');
        }
        // allow guests to switch their language
        const session = request.auth.credentials.data;
        session.data = { ...session.data, 'dw-lang': request.payload.language };
        await session.save();
        return h.response({
            status: 'ok',
            language: request.payload.language
        });
    }
    const res = await request.server.inject({
        method: 'PATCH',
        url: `/v3/users/${request.auth.artifacts.id}`,
        auth: request.auth,
        headers: request.headers,
        payload: request.payload
    });

    return h.response(res.result).code(res.statusCode);
}

async function deleteMe(request, h) {
    const res = await request.server.inject({
        method: 'DELETE',
        url: `/v3/users/${request.auth.artifacts.id}`,
        auth: request.auth,
        headers: request.headers,
        payload: request.payload
    });

    const { sessionID } = request.server.methods.config('api');

    return h.response(res.result).code(res.statusCode).unstate(sessionID);
}

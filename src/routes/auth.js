const { Op } = require('@datawrapper/orm').db;
const { camelizeKeys } = require('humps');
const Joi = require('@hapi/joi');
const Boom = require('@hapi/boom');
const { User, Session, AuthToken, Chart } = require('@datawrapper/orm/models');
const set = require('lodash/set');
const get = require('lodash/get');
const { cookieTTL } = require('../utils');
const { listResponse, noContentResponse, createResponseConfig } = require('../schemas/response.js');
const { createUserPayloadValidation } = require('./users');

module.exports = {
    name: 'auth-routes',
    version: '1.0.0',
    register: (server, options) => {
        server.route({
            method: 'POST',
            path: '/login',
            options: {
                auth: {
                    mode: 'try',
                    strategy: 'session'
                },
                validate: {
                    payload: Joi.object({
                        email: Joi.string()
                            .email()
                            .required()
                            .example('tony@stark-industries.com'),
                        password: Joi.string()
                            .required()
                            .example('morgan-3000'),
                        keepSession: Joi.boolean().default(true)
                    })
                }
            },
            handler: login
        });

        server.route({
            method: 'POST',
            path: '/logout',
            options: {
                auth: 'session'
            },
            handler: logout
        });

        server.route({
            method: 'GET',
            path: '/tokens',
            options: {
                tags: ['api'],
                description: 'List API tokens',
                notes: 'Response will not include full tokens for security reasons.',
                validate: {
                    query: Joi.object({
                        limit: Joi.number()
                            .integer()
                            .default(100)
                            .description('Maximum items to fetch. Useful for pagination.'),
                        offset: Joi.number()
                            .integer()
                            .default(0)
                            .description('Number of items to skip. Useful for pagination.')
                    })
                },
                response: listResponse
            },
            handler: getAllTokens
        });

        server.route({
            method: 'POST',
            path: '/tokens',
            options: {
                tags: ['api'],
                description: 'Create API token',
                notes: `This endpoint will create a new API Token and show it in the response body.
                     It is possible to create a comment with every token to have a reference where it is used.
                     Make sure to save the token somewhere, since you won't be able to see it again.`,
                validate: {
                    payload: Joi.object({
                        comment: Joi.string()
                            .required()
                            .example('Token for fun project')
                            .description(
                                'The comment can be everything. Tip: Use something to remember where this specific token is used.'
                            )
                    })
                },
                response: createResponseConfig({
                    schema: Joi.object({
                        id: Joi.number().integer(),
                        comment: Joi.string(),
                        token: Joi.string(),
                        createdAt: Joi.date()
                    }).unknown()
                })
            },
            handler: createToken
        });

        server.route({
            method: 'DELETE',
            path: '/tokens/{id}',
            options: {
                tags: ['api'],
                description: 'Delete API token',
                notes:
                    'Delete an API access token. Check [/v3/auth/tokens](ref:authtokens) to get the IDs of your available tokens.',
                validate: {
                    params: Joi.object({
                        id: Joi.number()
                            .integer()
                            .required()
                            .description('ID of the token to be deleted.')
                    })
                },
                response: noContentResponse
            },
            handler: deleteToken
        });

        server.route({
            method: 'POST',
            path: '/signup',
            options: {
                auth: {
                    mode: 'try',
                    strategy: 'session'
                },
                validate: {
                    payload: createUserPayloadValidation
                }
            },
            handler: signup
        });

        server.route({
            method: 'POST',
            path: '/activate/{token}',
            options: {
                auth: {
                    mode: 'try'
                },
                validate: {
                    params: Joi.object({
                        token: Joi.string()
                            .required()
                            .description('User activation token')
                    }),
                    payload: Joi.object({
                        password: Joi.string().description('New password of the user.')
                    })
                }
            },
            handler: activateAccount
        });

        server.route({
            method: 'POST',
            path: '/resend-activation',
            options: {
                validate: {
                    payload: Joi.object({
                        email: Joi.string()
                            .email()
                            .required()
                            .example('strange@kamar-taj.com.np')
                            .description('Email address of the user.')
                    })
                }
            },
            handler: resendActivation
        });

        server.route({
            method: 'POST',
            path: '/reset-password',
            options: {
                auth: {
                    mode: 'try'
                },
                validate: {
                    payload: Joi.object({
                        email: Joi.string()
                            .email()
                            .required()
                            .example('strange@kamar-taj.com.np')
                            .description('Email address of the user.'),
                        token: Joi.string()
                            .example('shamballa')
                            .description(
                                'Admin users can specify this token otherwise a random token is generated.'
                            )
                    })
                }
            },
            handler: resetPassword
        });

        server.route({
            method: 'POST',
            path: '/change-password',
            options: {
                auth: {
                    mode: 'try'
                },
                validate: {
                    payload: Joi.object({
                        email: Joi.string()
                            .email()
                            .required()
                            .example('strange@kamar-taj.com.np')
                            .description('Email address of the user.'),
                        password: Joi.string()
                            .required()
                            .example('tales-126')
                            .description(
                                'A new strong password. Ideally this is generated and saved in a password manager.'
                            ),
                        token: Joi.string()
                            .example('shamballa')
                            .required()
                            .description('Password reset token which is send as email to the user.')
                    })
                }
            },
            handler: changePassword
        });

        server.route({
            method: 'POST',
            path: '/session',
            options: {
                auth: {
                    mode: 'try'
                }
            },
            handler: handleSession
        });
    }
};

async function createSession(id, userId, keepSession = true) {
    return Session.create({
        id,
        data: {
            'dw-user-id': userId,
            persistent: keepSession,
            last_action_time: Math.floor(Date.now() / 1000)
        }
    });
}

async function associateChartsWithUser(sessionId, userId) {
    /* Sequelize returns [0] when no row was updated */
    if (!sessionId) return [0];

    return Chart.update(
        {
            author_id: userId,
            guest_session: null
        },
        {
            where: {
                author_id: null,
                guest_session: sessionId
            }
        }
    );
}

async function handleSession(request, h) {
    const { auth, server } = request;

    const api = server.methods.config('api');

    if (auth.credentials && auth.credentials.session) {
        return { [api.sessionID]: auth.credentials.session };
    }

    const session = await createSession(server.methods.generateToken(), undefined, false);

    return h
        .response({
            [api.sessionID]: session.id
        })
        .state(api.sessionID, session.id, {
            ttl: cookieTTL(30)
        });
}

async function login(request, h) {
    const { email, password, keepSession } = request.payload;
    const user = await User.findOne({
        where: { email },
        attributes: ['id', 'pwd', 'reset_password_token']
    });

    if (!user) {
        return Boom.unauthorized('Invalid credentials');
    }

    const { generateToken, config, comparePassword } = request.server.methods;
    const api = config('api');

    let isValid = await comparePassword(password, user.pwd, {
        userId: user.id
    });

    if (!isValid && password === user.reset_password_token) {
        isValid = true;

        await user.update({ reset_password_token: null });
    }

    if (!isValid) {
        return Boom.unauthorized('Invalid credentials');
    }

    let session;

    if (request.auth.artifacts && request.auth.artifacts.role === 'guest') {
        session = request.auth.credentials.data;
        /* associate guest session with newly created user */
        await Promise.all([
            session.update({
                data: {
                    ...session.data,
                    'dw-user-id': user.id,
                    last_action_time: Math.floor(Date.now() / 1000)
                }
            }),
            associateChartsWithUser(session.id, user.id)
        ]);
    } else {
        session = await createSession(generateToken(), user.id, keepSession);
    }

    return h
        .response({
            [api.sessionID]: session.id
        })
        .state(api.sessionID, session.id, {
            ttl: cookieTTL(keepSession ? 90 : 30)
        });
}

async function logout(request, h) {
    const session = await Session.findByPk(request.auth.credentials.session, {
        attributes: ['id']
    });

    if (session) {
        await session.destroy();
    }

    const api = request.server.methods.config('api');

    return h
        .response()
        .code(205)
        .unstate(api.sessionID)
        .header('Clear-Site-Data', '"cookies", "storage", "executionContexts"');
}

async function getAllTokens(request, h) {
    const { query, auth, url } = request;

    if (auth.artifacts.role === 'guest') {
        return Boom.unauthorized();
    }

    const options = {
        attributes: ['id', 'token', 'last_used_at', 'comment'],
        where: {
            user_id: auth.artifacts.id
        },
        limit: query.limit,
        offset: query.offset
    };

    const { count, rows } = await AuthToken.findAndCountAll(options);

    const tokenList = {
        list: rows.map(({ dataValues }) => {
            const { token, ...data } = dataValues;
            return camelizeKeys({
                ...data,
                lastTokenCharacters: token.slice(-4),
                url: `${url.pathname}/${data.id}`
            });
        }),
        total: count
    };

    if (query.limit + query.offset < count) {
        const nextParams = new URLSearchParams({
            ...query,
            offset: query.limit + query.offset,
            limit: query.limit
        });

        set(tokenList, 'next', `${url.pathname}?${nextParams.toString()}`);
    }

    return tokenList;
}

async function createToken(request, h) {
    if (request.auth.artifacts.role === 'guest') {
        return Boom.unauthorized();
    }

    const token = await AuthToken.newToken({
        user_id: request.auth.artifacts.id,
        comment: request.payload.comment
    });

    const { user_id, ...data } = token.dataValues;

    return camelizeKeys(data);
}

async function deleteToken(request, h) {
    if (request.auth.artifacts.role === 'guest') {
        return Boom.unauthorized();
    }

    const token = await AuthToken.findByPk(request.params.id, {
        where: { user_id: request.auth.artifacts.id }
    });

    if (!token) {
        return Boom.notFound();
    }

    await token.destroy();
    return h.response().code(204);
}

async function signup(request, h) {
    let session;

    if (request.auth.isAuthenticated) {
        session = await Session.findByPk(request.auth.credentials.session);
        if (session.data['dw-user-id']) {
            return Boom.badRequest('Impossible to sign up with active user session');
        }
    }

    const { generateToken, config } = request.server.methods;

    const res = await request.server.inject({
        method: 'POST',
        url: '/v3/users',
        payload: request.payload
    });

    if (res.statusCode !== 201) {
        return h.response(res.result).code(res.statusCode);
    }

    if (session) {
        /* associate guest session with newly created user */
        await Promise.all([
            session.update({
                data: {
                    ...session.data,
                    'dw-user-id': res.result.id,
                    last_action_time: Math.floor(Date.now() / 1000)
                }
            }),
            associateChartsWithUser(session.id, res.result.id)
        ]);
    } else {
        session = await createSession(generateToken(), res.result.id);
    }

    const api = config('api');

    return h.response(res.result).state(api.sessionID, session.id, {
        ttl: cookieTTL(90)
    });
}

async function activateAccount(request, h) {
    let user = await User.findOne({
        attributes: ['id'],
        where: { activate_token: request.params.token }
    });

    if (!user) {
        return Boom.notFound();
    }

    const userData = { role: 'editor', activate_token: null };

    const { password } = request.payload;
    if (password) {
        userData.pwd = await request.server.methods.hashPassword(password);
    }

    user = await user.update(userData);

    const response = h.response().code(204);

    if (!request.auth.credentials) {
        const api = request.server.methods.config('api');
        const session = await createSession(request.server.methods.generateToken(), user.id);

        response.state(api.sessionID, session.id, {
            ttl: cookieTTL(90)
        });
    }

    return response;
}

async function resetPassword(request, h) {
    const { generateToken, isAdmin, config } = request.server.methods;
    let token = generateToken();

    if (isAdmin(request) && request.payload.token) {
        token = request.payload.token;
    }

    const user = await User.findOne({
        attributes: ['id', 'language', 'email'],
        where: { email: request.payload.email }
    });

    if (!user) {
        return Boom.notFound();
    }

    await user.update({ reset_password_token: token });

    const { https, domain } = config('frontend');

    await request.server.app.events.emit(request.server.app.event.SEND_EMAIL, {
        type: 'reset-password',
        to: user.email,
        language: user.language,
        data: {
            reset_password_link: `${
                https ? 'https' : 'http'
            }://${domain}/account/reset-password/${token}`
        }
    });

    return h.response().code(204);
}

async function changePassword(request, h) {
    const { server, payload } = request;
    const { token, password, email } = payload;

    if (!token || !email) return Boom.badRequest();

    const user = await User.findOne({
        where: { email: email, reset_password_token: token }
    });

    if (user) {
        const pwd = await server.methods.hashPassword(password);
        await user.update({ pwd, reset_password_token: null });

        return h.response().code(204);
    }

    return Boom.badRequest();
}

async function resendActivation(request, h) {
    const { email } = get(request, ['auth', 'artifacts'], {});
    const isAdmin = request.server.methods.isAdmin(request);
    const { domain, https } = request.server.methods.config('frontend');

    if (!isAdmin && request.payload.email !== email) {
        return Boom.forbidden();
    }

    const user = await User.findOne({
        where: { email: request.payload.email, activate_token: { [Op.not]: null } },
        attributes: ['email', 'language', 'activate_token']
    });

    if (!user || !user.activate_token) {
        return Boom.resourceGone('User is already activated');
    }

    await request.server.app.events.emit(request.server.app.event.SEND_EMAIL, {
        type: 'activation',
        to: user.email,
        language: user.language,
        data: {
            activation_link: `${https ? 'https' : 'http'}://${domain}/account/activate/${
                user.activate_token
            }`
        }
    });

    return request.payload;
}

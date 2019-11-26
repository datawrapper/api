const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { Op } = require('sequelize');
const { camelizeKeys } = require('humps');
const Joi = require('@hapi/joi');
const Boom = require('@hapi/boom');
const { User, Session, AuthToken, Chart } = require('@datawrapper/orm/models');
const set = require('lodash/set');
const get = require('lodash/get');
const { cookieTTL } = require('../utils');
const { listResponse, noContentResponse, createResponseConfig } = require('../schemas/response.js');

const DEFAULT_SALT = 'uRPAqgUJqNuBdW62bmq3CLszRFkvq4RW';

/**
 * Generate a sha256 hash from a string. This is used in the PHP API and is needed for backwards
 * compatibility.
 *
 * @param {string} pwhash - value to hash with sha256
 * @param {string} secret - salt to hash the value with
 * @returns {string}
 */
function legacyHash(pwhash, secret = DEFAULT_SALT) {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(pwhash);
    return hmac.digest('hex');
}

/**
 * The old PHP API used sha256 to hash passwords with constant salts.
 * The Node.js API uses bcrypt which is more secure.
 * It is still important to support the old way for migration purposes since PHP and Node API
 * will live side by side for some time.
 * When the PHP Server gets turned off, we can hopefully delete this function.
 *
 * @deprecated
 * @param {string} password - Password string sent from the client (Can be client side hashed or not)
 * @param {string} passwordHash - Password hash to compare (from DB)
 * @param {string} authSalt - defined in config.js
 * @param {string} secretAuthSalt - defined in config.js
 * @returns {boolean}
 */
function legacyLogin(password, passwordHash, authSalt, secretAuthSalt) {
    let serverHash = secretAuthSalt ? legacyHash(password, secretAuthSalt) : password;

    if (serverHash === passwordHash) return true;

    const clientHash = legacyHash(password, authSalt);
    serverHash = secretAuthSalt ? legacyHash(clientHash, secretAuthSalt) : clientHash;
    return serverHash === passwordHash;
}

/**
 * Migrate the old sha256 password hash to a more modern and secure bcrypt hash.
 *
 * @param {number} userId - ID of the user to migrate
 * @param {string} password - User password
 * @param {number} hashRounds - Iteration amout for bcrypt
 */
async function migrateHashToBcrypt(userId, password, hashRounds) {
    const hash = await bcrypt.hash(password, hashRounds);

    await User.update(
        {
            pwd: hash
        },
        { where: { id: userId } }
    );
}

module.exports = {
    name: 'auth-routes',
    version: '1.0.0',
    register: (server, options) => {
        /* server.route({
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
        }); */

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

        /* server.route({
            method: 'POST',
            path: '/signup',
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
                            .example('tony@stark-industries.com')
                            .description('Email address of the user signing up.'),
                        password: Joi.string()
                            .required()
                            .example('morgan-3000')
                            .description(
                                'A strong user password. Ideally this is generated and saved in a password manager.'
                            ),
                        language: Joi.string()
                            .default('en_US')
                            .description('Preferred language for the user interface.')
                    })
                }
            },
            handler: signup
        }); */

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
    return Chart.update(
        {
            author_id: userId,
            guest_session: null
        },
        {
            where: {
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

// eslint-disable-next-line
async function login(request, h) {
    const { email, password, keepSession } = request.payload;
    const user = await User.findOne({
        where: { email },
        attributes: ['id', 'pwd', 'reset_password_token']
    });

    if (!user) {
        return Boom.unauthorized('Invalid credentials');
    }

    let isValid = false;
    const { generateToken, config } = request.server.methods;
    const api = config('api');

    /**
     * Bcrypt uses a prefix for versioning. That way a bcrypt hash can be identified with "$2".
     * https://en.wikipedia.org/wiki/Bcrypt#Description
     */
    if (user.pwd.startsWith('$2')) {
        isValid = await bcrypt.compare(password, user.pwd);

        /**
         * Due to the migration from sha256 to bcrypt, the API must deal with sha256 passwords that
         * got created by the PHP API and migrated from the `migrateHashToBcrypt` function.
         * The node API get's passwords only in clear text and to compare those with a migrated
         * password, it first has to generate the former client hashed password.
         */
        if (!isValid) {
            isValid = await bcrypt.compare(legacyHash(password, api.authSalt), user.pwd);
        }
    } else {
        /**
         * The user password hash was created by the PHP API and is not a bcrypt hash. That means
         * the API needs to use the old comparison method with double sha256 hashes.
         */
        isValid = legacyLogin(password, user.pwd, api.authSalt, api.secretAuthSalt);

        /**
         * When the old method works, the API migrates the old hash to a bcrypt hash for more
         * security. This ensures a seemless migration for users.
         */
        if (isValid && api.enableMigration) {
            await migrateHashToBcrypt(user.id, password, api.hashRounds);
        }
    }

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

// eslint-disable-next-line
async function signup(request, h) {
    let session;

    if (request.auth.isAuthenticated) {
        session = await Session.findByPk(request.auth.credentials.session);

        if (session.data['dw-user-id']) {
            return Boom.badRequest('Impossible to sign up with active user session');
        }
    }

    const { generateToken, config } = request.server.methods;

    request.payload.activate_token = generateToken();

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

    const { activateToken, ...data } = res.result;

    const { https, domain } = config('frontend');

    await request.server.app.events.emit(request.server.app.event.SEND_EMAIL, {
        type: 'activation',
        to: data.email,
        language: data.language,
        data: {
            activation_link: `${
                https ? 'https' : 'http'
            }://${domain}/account/activate/${activateToken}`
        }
    });

    return h.response(camelizeKeys(data)).state(config('api').sessionID, session.id, {
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

    user = await user.update({ role: 'editor', activate_token: null });

    const response = h.response().code(204);

    if (!request.auth.credentials) {
        const { sessionID } = request.server.methods.config('api');
        const session = await createSession(request.server.methods.generateToken(), user.id);

        response.state(sessionID, session.id, {
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
    const { email } = get(request, ['auth', 'artifacts'], {});
    const { server, payload } = request;
    const { token, password } = payload;

    if (!email) {
        const user = await User.findOne({
            where: { email: payload.email, reset_password_token: token }
        });

        if (user) {
            const pwd = await server.methods.hashPassword(password);
            await user.update({ pwd, reset_password_token: null });

            return h.response().code(204);
        }
    }

    if (email === payload.email) {
        const pwd = await server.methods.hashPassword(password);
        await User.update({ pwd }, { where: { email } });

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

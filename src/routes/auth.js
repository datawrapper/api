const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { camelizeKeys } = require('humps');
const Joi = require('joi');
const Boom = require('boom');
const { User, Session, AuthToken } = require('@datawrapper/orm/models');
const set = require('lodash/set');
const get = require('lodash/get');
const { cookieTTL } = require('../utils');

const DEFAULT_SALT = 'uRPAqgUJqNuBdW62bmq3CLszRFkvq4RW';

/**
 * Generate a sha256 hash from a string. This is used in the PHP API and is needed for backwards
 * compatibility.
 *
 * @param {string} pwhash - value to hash with sha256
 * @param {string} secret - salt to hash the value with
 * @returns {string}
 */
function legacyHash(pwhash, secret) {
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

    const clientHash = legacyHash(password, authSalt || DEFAULT_SALT);
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
        server.route({
            method: 'POST',
            path: '/login',
            options: {
                tags: ['api'],
                auth: false,
                validate: {
                    payload: {
                        email: Joi.string()
                            .email()
                            .required(),
                        password: Joi.string().required(),
                        keepSession: Joi.boolean().default(true)
                    }
                }
            },
            handler: login
        });

        server.route({
            method: 'POST',
            path: '/logout',
            options: {
                tags: ['api'],
                auth: 'session'
            },
            handler: logout
        });

        server.route({
            method: 'GET',
            path: '/tokens',
            options: {
                tags: ['api'],
                validate: {
                    query: {
                        limit: Joi.number()
                            .integer()
                            .default(100),
                        offset: Joi.number()
                            .integer()
                            .default(0)
                    }
                }
            },
            handler: getAllTokens
        });

        server.route({
            method: 'POST',
            path: '/tokens',
            options: {
                tags: ['api'],
                validate: {
                    payload: Joi.object({
                        comment: Joi.string().required()
                    })
                }
            },
            handler: createToken
        });

        server.route({
            method: 'DELETE',
            path: '/tokens/{id}',
            options: {
                tags: ['api'],
                validate: {
                    params: {
                        id: Joi.number().required()
                    }
                }
            },
            handler: deleteToken
        });

        server.route({
            method: 'POST',
            path: '/signup',
            options: {
                tags: ['api'],
                auth: {
                    mode: 'try',
                    strategy: 'session'
                },
                validate: {
                    payload: {
                        email: Joi.string()
                            .email()
                            .required(),
                        language: Joi.string().default('en_US'),
                        password: Joi.string().required()
                    }
                }
            },
            handler: signup
        });

        server.route({
            method: 'POST',
            path: '/activate/{token}',
            options: {
                tags: ['api'],
                auth: {
                    mode: 'try'
                },
                validate: {
                    params: { token: Joi.string().required() }
                }
            },
            handler: activateAccount
        });

        server.route({
            method: 'POST',
            path: '/reset-password',
            options: {
                tags: ['api'],
                auth: {
                    mode: 'try'
                },
                validate: {
                    payload: {
                        email: Joi.string()
                            .email()
                            .required()
                    }
                }
            },
            handler: resetPassword
        });

        server.route({
            method: 'POST',
            path: '/change-password/{token?}',
            options: {
                tags: ['api'],
                auth: {
                    mode: 'try'
                },
                validate: {
                    payload: {
                        password: Joi.string().required()
                    }
                }
            },
            handler: changePassword
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

async function login(request, h) {
    const { email, password, keepSession } = request.payload;
    const user = await User.findOne({
        where: { email },
        attributes: ['id', 'pwd']
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

    if (!isValid) {
        return Boom.unauthorized('Invalid credentials');
    }

    const session = await createSession(generateToken(), user.id, keepSession);

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
    const token = await AuthToken.newToken({
        user_id: request.auth.artifacts.id,
        comment: request.payload.comment
    });

    const { user_id, ...data } = token.dataValues;

    return camelizeKeys(data);
}

async function deleteToken(request, h) {
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

    request.payload.activate_token = generateToken();

    const res = await request.server.inject({
        method: 'POST',
        url: '/v3/users',
        payload: request.payload
    });

    if (res.statusCode !== 201) {
        return h.response(res.result).code(res.statusCode);
    }

    session = await createSession(generateToken(), res.result.id);

    const { activate_token, ...data } = res.result;

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

    let response = h.response().code(204);

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
    let user = await User.update(
        {
            reset_password_token: request.server.methods.generateToken()
        },
        {
            attributes: ['id'],
            where: { email: request.payload.email }
        }
    );

    if (!user[0]) {
        return Boom.notFound();
    }

    /* TODO: send email */

    return h.response().code(204);
}

async function changePassword(request, h) {
    const { id, resetPasswordToken } = get(request, ['auth', 'artifacts']);
    const { server, payload, params } = request;
    const { token } = params;

    if (id) {
        if (!token === !resetPasswordToken) {
            const pwd = await server.methods.hashPassword(payload.password);
            await User.update({ pwd, reset_password_token: null }, { where: { id } });

            return h.response().code(204);
        }
        return Boom.conflict();
    }

    if (token) {
        const user = await User.findOne({
            attributes: ['id'],
            where: { reset_password_token: token }
        });

        if (user) {
            const pwd = await server.methods.hashPassword(payload.password);
            await user.update({ pwd, reset_password_token: null });

            return h.response().code(204);
        }
    }

    return Boom.notFound();
}

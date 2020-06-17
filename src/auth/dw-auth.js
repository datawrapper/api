const Boom = require('@hapi/boom');
const get = require('lodash/get');
const AuthBearer = require('hapi-auth-bearer-token');
const AuthCookie = require('./cookie-auth');
const getUser = require('./get-user');
const authUtils = require('./utils.js');
const { AccessToken } = require('@datawrapper/orm/models');

async function bearerValidation(request, token, h) {
    const row = await AccessToken.findOne({ where: { token, type: 'api-token' } });

    if (!row) {
        return { isValid: false, message: Boom.unauthorized('Token not found', 'Token') };
    }

    await row.update({ last_used_at: new Date() });

    return getUser(row.user_id, {
        credentials: { token, scope: row.data.scopes || ['all'] },
        strategy: 'Token'
    });
}

function dwAuth(server, options = {}) {
    const scheme = {
        authenticate: async (request, h) => {
            let credentials = {};
            let artifacts = {};

            try {
                const bearer = await server.auth.test('bearer', request);
                credentials = bearer.credentials;
                artifacts = bearer.artifacts;
            } catch (error) {
                try {
                    const cookie = await server.auth.test('session', request);
                    credentials = cookie.credentials;
                    artifacts = cookie.artifacts;
                } catch (error) {
                    throw Boom.unauthorized('Invalid authentication credentials', [
                        'Session',
                        'Token'
                    ]);
                }
            }

            if (options.validate) {
                options.validate({ credentials, artifacts });
            }

            return h.authenticated({ credentials, artifacts });
        }
    };

    return scheme;
}

function adminValidation({ artifacts } = {}) {
    if (artifacts.role !== 'admin') {
        throw Boom.unauthorized('ADMIN_ROLE_REQUIRED');
    }
}

const DWAuth = {
    name: 'dw-auth',
    version: '1.0.0',
    register: async (server, options) => {
        await server.register([AuthCookie, AuthBearer]);

        function isAdmin(request, { throwError = false } = {}) {
            const check = get(request, ['auth', 'artifacts', 'role'], '') === 'admin';

            if (throwError && !check) {
                throw Boom.unauthorized();
            }

            return check;
        }

        server.method('isAdmin', isAdmin);
        server.method('comparePassword', authUtils.createComparePassword(server));

        const { hashRounds = 15 } = server.methods.config('api');
        server.method('hashPassword', authUtils.createHashPassword(hashRounds));

        server.auth.scheme('dw-auth', dwAuth);

        server.auth.strategy('bearer', 'bearer-access-token', { validate: bearerValidation });
        server.auth.strategy('session', 'cookie-auth');
        server.auth.strategy('simple', 'dw-auth');
        server.auth.strategy('admin', 'dw-auth', { validate: adminValidation });

        server.auth.default('simple');
    }
};

module.exports = DWAuth;

const Boom = require('boom');
const AuthBearer = require('hapi-auth-bearer-token');
const AuthCookie = require('./cookie-auth');
const get = require('lodash/get');

const { AuthToken, Session, User } = require('@datawrapper/orm/models');

async function getUser(userId, credentials, strategy) {
    const user = await User.findByPk(userId, {
        attributes: ['id', 'email', 'role']
    });

    if (!user) {
        return { isValid: false, message: Boom.unauthorized('User not found', strategy) };
    }

    return { isValid: true, credentials, artifacts: user.serialize() };
}

async function cookieValidation(request, session, h) {
    let row = await Session.findByPk(session);

    if (!row) {
        return { isValid: false, message: Boom.unauthorized('Session not found', 'Session') };
    }

    row = await row.update({
        data: {
            ...row.data,
            last_action_time: Math.floor(Date.now() / 1000)
        }
    });

    return getUser(row.data['dw-user-id'], { session }, 'Session');
}

async function bearerValidation(request, token, h) {
    const row = await AuthToken.findOne({ where: { token } });

    if (!row) {
        return { isValid: false, message: Boom.unauthorized('Token not found', 'Token') };
    }

    return getUser(row.user_id, { token }, 'Token');
}

const internals = {};

internals.implementation = (server, options) => {
    const scheme = {
        authenticate: async (request, h) => {
            let credentials = {};
            let artifacts = {};

            try {
                const cookie = await server.auth.test('session', request);
                credentials = cookie.credentials;
                artifacts = cookie.artifacts;
            } catch (error) {
                try {
                    const bearer = await server.auth.test('bearer', request);
                    credentials = bearer.credentials;
                    artifacts = bearer.artifacts;
                } catch (error) {
                    return Boom.unauthorized('Invalid authentication credentials', [
                        'Session',
                        'Token'
                    ]);
                }
            }

            return h.authenticated({ credentials, artifacts });
        }
    };

    return scheme;
};

const DWAuth = {
    name: 'dw-auth',
    version: '1.0.0',
    register: async (server, options) => {
        await server.register([AuthCookie, AuthBearer]);

        server.auth.strategy('bearer', 'bearer-access-token', {
            validate: bearerValidation
        });

        server.auth.strategy('session', 'cookie-auth', {
            validate: cookieValidation
        });

        function isAdmin(request, { throwError = false } = {}) {
            const check = get(request, ['auth', 'artifacts', 'role'], '') === 'admin';

            if (throwError && !check) {
                throw Boom.unauthorized();
            }

            return check;
        }

        server.method('isAdmin', isAdmin);

        server.auth.scheme('dw-auth', internals.implementation);
    }
};

module.exports = DWAuth;

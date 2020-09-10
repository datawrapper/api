const Boom = require('@hapi/boom');
const get = require('lodash/get');
const AuthBearer = require('hapi-auth-bearer-token');
const {
    createComparePassword,
    createHashPassword,
    createCookieAuthScheme,
    bearerValidation,
    adminValidation
} = require('@datawrapper/shared/node/auth')(require('@datawrapper/orm/models'));
const cookieAuthScheme = createCookieAuthScheme(false);

const DWAuth = {
    name: 'dw-auth',
    version: '1.0.0',
    register: async (server, options) => {
        function isAdmin(request, { throwError = false } = {}) {
            const check = get(request, ['auth', 'artifacts', 'role'], '') === 'admin';

            if (throwError && !check) {
                throw Boom.unauthorized();
            }

            return check;
        }

        const { hashRounds = 15 } = server.methods.config('api');
        server.method('isAdmin', isAdmin);
        server.method('comparePassword', createComparePassword(server));
        server.method('hashPassword', createHashPassword(hashRounds));

        await server.register(AuthBearer);
        server.auth.scheme('cookie-auth', cookieAuthScheme);
        server.auth.scheme('dw-auth', dwAuth);

        server.auth.strategy('bearer', 'bearer-access-token', { validate: bearerValidation });
        server.auth.strategy('session', 'cookie-auth');
        server.auth.strategy('simple', 'dw-auth');
        server.auth.strategy('admin', 'dw-auth', { validate: adminValidation });

        server.auth.default('simple');
    }
};

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

module.exports = DWAuth;

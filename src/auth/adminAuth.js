const Boom = require('boom');

const internals = {};

internals.implementation = (server, options) => {
    const scheme = {
        authenticate: async (request, h) => {
            let credentials = {};
            let artifacts = {};

            try {
                const bearer = await server.auth.test('simple', request);
                credentials = bearer.credentials;
                artifacts = bearer.artifacts;
            } catch (error) {
                try {
                    const cookie = await server.auth.test('session', request);
                    credentials = cookie.credentials;
                    artifacts = cookie.artifacts;
                } catch (error) {
                    return Boom.notFound();
                }
            }

            if (artifacts.role !== 0) {
                return Boom.notFound();
            }

            return h.authenticated({ credentials });
        }
    };

    return scheme;
};

const AdminAuth = {
    name: 'dw-admin-auth',
    version: '1.0.0',
    register: (server, options) => server.auth.scheme('admin-auth', internals.implementation)
};

module.exports = AdminAuth;

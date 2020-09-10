const { createSession, getStateOpts } = require('@datawrapper/shared/node/auth');

module.exports = async (server, options) => {
    // POST /v3/auth/session
    server.route({
        method: 'POST',
        path: '/session',
        options: {
            auth: {
                mode: 'try',
                access: { scope: ['auth:write'] }
            }
        },
        async handler(request, h) {
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
                .state(api.sessionID, session.id, getStateOpts(request.server, 30));
        }
    });
};

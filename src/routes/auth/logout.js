const { Session } = require('@datawrapper/orm/models');

module.exports = async (server, options) => {
    // POST /v3/auth/logout
    server.route({
        method: 'POST',
        path: '/logout',
        options: {
            auth: 'session'
        },
        async handler(request, h) {
            const session = await Session.findByPk(request.auth.credentials.session, {
                attributes: ['id']
            });

            if (request.auth.artifacts) {
                await request.server.methods.logAction(request.auth.artifacts.id, 'logout');
            }

            if (session) {
                await session.destroy();
            }

            const api = request.server.methods.config('api');

            return h.response().code(205).unstate(api.sessionID);
        }
    });
};

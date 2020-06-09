const { Session } = require('@datawrapper/orm/models');

module.exports = async (server, options) => {
    server.route({
        method: 'POST',
        path: '/logout',
        options: {
            auth: 'session'
        },
        handler: logout
    });
};

async function logout(request, h) {
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

    return h
        .response()
        .code(205)
        .unstate(api.sessionID);
}

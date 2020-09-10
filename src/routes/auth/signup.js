const Boom = require('@hapi/boom');
const { Session } = require('@datawrapper/orm/models');
const {
    associateChartsWithUser,
    createSession,
    getStateOpts
} = require('@datawrapper/shared/node/auth')(require('@datawrapper/orm/models'));
const { createUserPayload } = require('../../schemas/payload');

module.exports = async (server, options) => {
    // POST /v3/auth/signup
    server.route({
        method: 'POST',
        path: '/signup',
        options: {
            auth: {
                mode: 'try',
                strategy: 'session'
            },
            validate: {
                payload: createUserPayload
            }
        },
        handler: signup
    });
};

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
                user_id: res.result.id,
                persistent: true,
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

    return h
        .response(res.result)
        .state(api.sessionID, session.id, getStateOpts(request.server, 90));
}

const Joi = require('@hapi/joi');
const Boom = require('@hapi/boom');
const { User } = require('@datawrapper/orm/models');
const { createSession, getStateOpts } = require('@datawrapper/shared/node/auth');

module.exports = async (server, options) => {
    server.route({
        method: 'POST',
        path: '/activate/{token}',
        options: {
            auth: {
                mode: 'try'
            },
            validate: {
                params: Joi.object({
                    token: Joi.string().required().description('User activation token')
                }),
                payload: Joi.object({
                    password: Joi.string().min(8).description('New password of the user.')
                }).allow(null)
            }
        },
        handler: activateAccount
    });
};

async function activateAccount(request, h) {
    let user = await User.findOne({
        attributes: ['id'],
        where: { activate_token: request.params.token }
    });

    if (!user) {
        return Boom.notFound();
    }

    const userData = { role: 'editor', activate_token: null };

    if (request.payload) {
        const { password } = request.payload;
        if (password) {
            userData.pwd = await request.server.methods.hashPassword(password);
        }
    }

    user = await user.update(userData);

    const response = h.response().code(204);

    const api = request.server.methods.config('api');
    let session;

    if (!request.auth.credentials) {
        // create a new session
        session = await createSession(request.server.methods.generateToken(), user.id);
    } else {
        // associate guest session with the activated user
        session = request.auth.credentials.data;
        await session.update({
            user_id: user.id,
            persistent: true,
            data: {
                ...session.data,
                'dw-user-id': user.id,
                last_action_time: Math.floor(Date.now() / 1000)
            }
        });
    }

    response.state(api.sessionID, session.id, getStateOpts(request.server, 90));

    return response;
}

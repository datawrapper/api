const Joi = require('@hapi/joi');
const Boom = require('@hapi/boom');
const { User } = require('@datawrapper/orm/models');

module.exports = async (server, options) => {
    server.route({
        method: 'POST',
        path: '/reset-password',
        options: {
            auth: {
                mode: 'try'
            },
            validate: {
                payload: Joi.object({
                    email: Joi.string()
                        .email()
                        .required()
                        .example('strange@kamar-taj.com.np')
                        .description('Email address of the user.'),
                    token: Joi.string()
                        .example('shamballa')
                        .description(
                            'Admin users can specify this token otherwise a random token is generated.'
                        )
                })
            }
        },
        handler: resetPassword
    });
};

async function resetPassword(request, h) {
    const { generateToken, isAdmin, config } = request.server.methods;
    let token = generateToken();

    if (isAdmin(request) && request.payload.token) {
        token = request.payload.token;
    }

    const user = await User.findOne({
        attributes: ['id', 'language', 'email', 'reset_password_token'],
        where: { email: request.payload.email }
    });

    if (!user) {
        return Boom.notFound('email-not-found');
    }

    if (user.reset_password_token) {
        return Boom.badRequest('token-already-set');
    }

    await user.update({ reset_password_token: token });

    const { https, domain } = config('frontend');

    await request.server.app.events.emit(request.server.app.event.SEND_EMAIL, {
        type: 'reset-password',
        to: user.email,
        language: user.language,
        data: {
            reset_password_link: `${
                https ? 'https' : 'http'
            }://${domain}/account/reset-password/${token}`
        }
    });

    await request.server.methods.logAction(user.id, 'reset-password', token);

    return h.response().code(204);
}

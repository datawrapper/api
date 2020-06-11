const Joi = require('@hapi/joi');
const Boom = require('@hapi/boom');
const { User } = require('@datawrapper/orm/models');

module.exports = async (server, options) => {
    // POST /v3/auth/change-password
    server.route({
        method: 'POST',
        path: '/change-password',
        options: {
            auth: {
                mode: 'try'
            },
            validate: {
                payload: Joi.object({
                    password: Joi.string()
                        .min(8)
                        .required()
                        .example('tales-126')
                        .description(
                            'A new strong password. Ideally this is generated and saved in a password manager.'
                        ),
                    token: Joi.string()
                        .example('shamballa')
                        .required()
                        .description('Password reset token which is send as email to the user.')
                })
            }
        },
        handler: changePassword
    });
};

async function changePassword(request, h) {
    const { server, payload } = request;
    const { token, password } = payload;

    if (!token || !password) return Boom.badRequest();

    const user = await User.findOne({
        where: { reset_password_token: token }
    });

    if (user) {
        const pwd = await server.methods.hashPassword(password);
        await user.update({ pwd, reset_password_token: null });

        return h.response().code(204);
    }

    return Boom.badRequest();
}

const Joi = require('@hapi/joi');
const Boom = require('@hapi/boom');
const { User, Action } = require('@datawrapper/orm/models');
const get = require('lodash/get');
const { Op } = require('@datawrapper/orm').db;

module.exports = async (server, options) => {
    server.route({
        method: 'POST',
        path: '/resend-activation',
        options: {
            validate: {
                payload: Joi.object({
                    email: Joi.string()
                        .email()
                        .optional()
                        .example('strange@kamar-taj.com.np')
                        .description('Email address of the user.')
                }).allow(null)
            }
        },
        handler: resendActivation
    });
};

async function resendActivation(request, h) {
    const isAdmin = request.server.methods.isAdmin(request);
    const { domain, https } = request.server.methods.config('frontend');

    const email =
        isAdmin && get(request, ['payload', 'email'])
            ? request.payload.email
            : get(request, ['auth', 'artifacts', 'email']);

    if (!email) {
        return Boom.badRequest(
            'Please provide an email or a valid session to resend the activation link.'
        );
    }

    const user = await User.findOne({
        where: { email: email, activate_token: { [Op.not]: null } },
        attributes: ['id', 'email', 'language', 'activate_token']
    });

    if (!user || !user.activate_token) {
        return Boom.resourceGone('User is already activated');
    }

    if (!isAdmin) {
        const maxResendAttempts = 2;

        const resendAttempts = await Action.count({
            where: {
                user_id: user.id,
                key: 'resend-activation'
            }
        });

        if (resendAttempts >= maxResendAttempts) {
            return Boom.tooManyRequests(
                `User has already requested to resend the link ${maxResendAttempts} times. To avoid spamming, please contact support to activate your account.`
            );
        }
    }

    await request.server.methods.logAction(user.id, 'resend-activation');

    await request.server.app.events.emit(request.server.app.event.SEND_EMAIL, {
        type: 'activation',
        to: user.email,
        language: user.language,
        data: {
            activation_link: `${https ? 'https' : 'http'}://${domain}/account/activate/${
                user.activate_token
            }`
        }
    });

    return request.payload;
}

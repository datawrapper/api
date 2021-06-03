const Joi = require('joi');
const Boom = require('@hapi/boom');
const { User, AccessToken } = require('@datawrapper/orm/models');
const { db } = require('@datawrapper/orm');
const { Op } = db;
const { login, createSession, getStateOpts } = require('@datawrapper/service-utils/auth')(
    require('@datawrapper/orm/models')
);
const otpProviders = require('../../auth/otp');

module.exports = async (server, options) => {
    // POST /v3/auth/login
    server.route({
        method: 'POST',
        path: '/login',
        options: {
            auth: {
                mode: 'try',
                strategy: 'session'
            },
            validate: {
                payload: Joi.object({
                    email: Joi.string().email().required().example('tony@stark-industries.com'),
                    password: Joi.string().required().example('morgan-3000'),
                    keepSession: Joi.boolean().default(true),
                    otp: Joi.string()
                })
            },
            plugins: {
                crumb: false
            }
        },
        handler: loginUser
    });

    // GET /v3/auth/login/{token}
    server.route({
        method: 'GET',
        path: '/login/{token}',
        options: {
            tags: ['api'],
            auth: false,
            description: 'Login using login token',
            notes: 'Login using a one-time login token and redirect to the URL associated with the token. For use in CMS integrations.',
            validate: {
                params: Joi.object({
                    token: Joi.string().required().description('A valid login token.')
                })
            }
        },
        async handler(request, h) {
            const { params } = request;

            const token = await AccessToken.findOne({
                where: {
                    [Op.and]: [
                        { type: 'login-token' },
                        { token: params.token },
                        db.where(
                            db.col('created_at'),
                            Op.gt,
                            db.fn('DATE_ADD', db.fn('NOW'), db.literal('INTERVAL -5 MINUTE'))
                        )
                    ]
                }
            });

            if (!token) return Boom.notFound();

            // token found, destroy it so it can’t be used again
            await AccessToken.destroy({
                where: {
                    type: 'login-token',
                    token: params.token
                }
            });

            // create a new user session
            const { generateToken, config } = request.server.methods;
            const { api, frontend } = config();
            const session = await createSession(generateToken(), token.user_id, false, 'token');

            await request.server.methods.logAction(token.user_id, 'login/token');

            return h
                .response({
                    [api.sessionID]: session.id
                })
                .state(api.sessionID, session.id, getStateOpts(request.server, 30, 'None'))
                .redirect(
                    `${frontend.https ? 'https' : 'http'}://${frontend.domain}${
                        token.data.redirect_url
                    }`
                );
        }
    });
};

async function loginUser(request, h) {
    const { email, password, keepSession, otp } = request.payload;
    const user = await User.findOne({
        where: { email },
        attributes: ['id', 'pwd', 'reset_password_token']
    });

    if (!user) {
        return Boom.unauthorized('Invalid credentials');
    }

    const { config, comparePassword } = request.server.methods;
    const api = config('api');

    let isValid = await comparePassword(password, user.pwd, {
        userId: user.id
    });

    if (!isValid && password === user.reset_password_token) {
        isValid = true;

        await user.update({ reset_password_token: null });
    }

    if (!isValid) {
        return Boom.unauthorized('Invalid credentials');
    }

    // check if one of our otp providers is configured on server
    const enabledOTPProviders = [];
    for (let i = 0; i < otpProviders.length; i++) {
        const otpProvider = otpProviders[i];
        if (otpProvider.isEnabled({ config }) && (await otpProvider.isEnabledForUser({ user }))) {
            enabledOTPProviders.push(otpProvider);
        }
    }
    if (enabledOTPProviders.length > 0) {
        if (!otp) return Boom.unauthorized('Need OTP');
        let success = false;
        for (let i = 0; i < enabledOTPProviders.length; i++) {
            const otpProvider = enabledOTPProviders[i];
            const res = await otpProvider.verify({ user, otp, config });
            if (res) {
                success = true;
                break;
            }
        }
        if (!success) return Boom.unauthorized('Invalid OTP');
    }

    const session = await login(
        user.id,
        request.auth.artifacts && request.auth.artifacts.role === 'guest'
            ? request.auth.credentials
            : null,
        keepSession
    );
    await request.server.methods.logAction(user.id, 'login');

    return h
        .response({
            [api.sessionID]: session.id
        })
        .state(api.sessionID, session.id, getStateOpts(request.server, keepSession ? 90 : 30));
}

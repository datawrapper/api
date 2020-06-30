const Joi = require('@hapi/joi');
const Boom = require('@hapi/boom');
const { User, AccessToken } = require('@datawrapper/orm/models');
const { db } = require('@datawrapper/orm');
const { Op } = db;
const { associateChartsWithUser, createSession, getStateOpts } = require('../../auth/utils');

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
                    email: Joi.string()
                        .email()
                        .required()
                        .example('tony@stark-industries.com'),
                    password: Joi.string()
                        .required()
                        .example('morgan-3000'),
                    keepSession: Joi.boolean().default(true)
                })
            }
        },
        handler: login
    });

    // GET /v3/auth/login/{token}
    server.route({
        method: 'GET',
        path: '/login/{token}',
        options: {
            auth: false,
            description: 'Login using login token',
            notes: 'Login using a one-time login token, for use in CMS integrations',
            validate: {
                params: Joi.object({
                    token: Joi.string()
                        .required()
                        .description('A valid login token.')
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

            // token found, create a session
            await AccessToken.destroy({
                where: {
                    type: 'login-token',
                    token: params.token
                }
            });

            const { generateToken, config } = request.server.methods;
            const { api, frontend } = config();
            const session = await createSession(generateToken(), token.user_id, false);

            return h
                .response({
                    [api.sessionID]: session.id
                })
                .state(api.sessionID, session.id, getStateOpts(api.domain, 30))
                .redirect(
                    `${frontend.https ? 'https' : 'http'}://${frontend.domain}${
                        token.data.redirect_url
                    }`
                );
        }
    });
};

async function login(request, h) {
    const { email, password, keepSession } = request.payload;
    const user = await User.findOne({
        where: { email },
        attributes: ['id', 'pwd', 'reset_password_token']
    });

    if (!user) {
        return Boom.unauthorized('Invalid credentials');
    }

    const { generateToken, config, comparePassword } = request.server.methods;
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

    let session;

    if (request.auth.artifacts && request.auth.artifacts.role === 'guest') {
        session = request.auth.credentials.data;
        /* associate guest session with newly created user */
        await Promise.all([
            session.update({
                data: {
                    ...session.data,
                    'dw-user-id': user.id,
                    last_action_time: Math.floor(Date.now() / 1000)
                },
                user_id: user.id,
                persistent: keepSession
            }),
            associateChartsWithUser(session.id, user.id)
        ]);
    } else {
        session = await createSession(generateToken(), user.id, keepSession);
    }

    await request.server.methods.logAction(user.id, 'login');

    return h
        .response({
            [api.sessionID]: session.id
        })
        .state(api.sessionID, session.id, getStateOpts(api.domain, keepSession ? 90 : 30));
}

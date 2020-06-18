const Joi = require('@hapi/joi');
const Boom = require('@hapi/boom');
const { decamelizeKeys, camelizeKeys } = require('humps');
const set = require('lodash/set');
const { logAction } = require('@datawrapper/orm/utils/action');
const { User, Chart, Team, UserTeam, Session } = require('@datawrapper/orm/models');
const { serializeTeam } = require('../../teams/utils');
const { noContentResponse, userResponse } = require('../../../schemas/response');

const attributes = ['id', 'email', 'name', 'role', 'language'];

module.exports = {
    name: 'routes/users/{id}',
    version: '1.0.0',
    register: (server, options) => {
        // GET /v3/users/{id}
        server.route({
            method: 'GET',
            path: '/',
            options: {
                tags: ['api'],
                description: 'Fetch user information',
                auth: {
                    access: { scope: ['user', 'all'] }
                },
                validate: {
                    params: Joi.object({
                        id: Joi.number()
                            .required()
                            .description('User ID')
                    })
                },
                response: userResponse
            },
            handler: getUser
        });

        // PATCH /v3/users/{id}
        server.route({
            method: 'PATCH',
            path: '/',
            options: {
                tags: ['api'],
                description: 'Update user information',
                auth: {
                    access: { scope: ['user', 'all'] }
                },
                validate: {
                    params: Joi.object({
                        id: Joi.number()
                            .required()
                            .description('User ID')
                    }),
                    payload: Joi.object({
                        name: Joi.string()
                            .allow(null)
                            .example('Rocket Raccoon')
                            .description('New user name'),
                        email: Joi.string()
                            .email()
                            .example('89P13@half.world')
                            .description('New user email address'),
                        role: Joi.string()
                            .valid('editor', 'admin')
                            .description('New user role. Can only be changed by admins.'),
                        language: Joi.string()
                            .example('en_US')
                            .description('New language preference.'),
                        activateToken: Joi.string()
                            .allow(null)
                            .description(
                                'Activate token, typically used to unset it when activating user.'
                            ),
                        password: Joi.string()
                            .example('13-binary-1968')
                            .min(8)
                            .description('Strong user password.'),
                        oldPassword: Joi.string().description('The previous user password.')
                    })
                },
                response: userResponse
            },
            handler: editUser
        });

        // DELETE /v3/users/{id}
        server.route({
            method: 'DELETE',
            path: '/',
            options: {
                tags: ['api'],
                auth: {
                    access: { scope: ['user', 'all'] }
                },
                description: 'Delete user',
                validate: {
                    params: Joi.object({
                        id: Joi.number()
                            .required()
                            .description('User ID')
                    }),
                    payload: Joi.object({
                        email: Joi.string()
                            .email()
                            .example('james.barnes@shield.com')
                            .description('User email address to confirm deletion.'),
                        password: Joi.string().description('User password to confirm deletion')
                    })
                },
                response: noContentResponse
            },
            handler: deleteUser
        });

        require('./data')(server, options);
        require('./settings')(server, options);
        require('./setup')(server, options);
    }
};

async function getUser(request, h) {
    const { params, url, auth } = request;
    const userId = params.id;
    const isAdmin = request.server.methods.isAdmin(request);

    await request.server.methods.userIsDeleted(userId);

    if (userId !== auth.artifacts.id && !isAdmin) {
        throw Boom.unauthorized();
    }

    const options = {
        attributes,
        include: [{ model: Chart, attributes: ['id'] }]
    };

    if (isAdmin) {
        set(options, ['include', 1], { model: Team, attributes: ['id', 'name'] });

        options.attributes = options.attributes.concat([
            'created_at',
            'activate_token',
            'reset_password_token'
        ]);
    }

    const user = await User.findByPk(userId, options);

    const { charts, teams, ...data } = user.dataValues;

    if (teams) {
        data.teams = teams.map(serializeTeam);
    }

    if (isAdmin) {
        const products = await user.getAllProducts();
        data.products = products.map(product => ({
            id: product.id,
            name: product.name,
            url: `/v3/products/${product.id}`
        }));
    }

    return camelizeKeys({
        ...data,
        role: user.role,
        chartCount: charts.length,
        url: url.pathname
    });
}

async function editUser(request, h) {
    const { auth, params, payload, server } = request;
    const {
        generateToken,
        isAdmin,
        userIsDeleted,
        hashPassword,
        comparePassword,
        config
    } = server.methods;
    const userId = params.id;

    await userIsDeleted(userId);

    if (userId !== auth.artifacts.id) {
        isAdmin(request, { throwError: true });
    }

    const data = {
        language: payload.language,
        name: payload.name
    };

    if (payload.email) {
        // see if there already is an existing user with that email address
        const existingUser = await User.findOne({ where: { email: payload.email } });
        if (existingUser) {
            return Boom.conflict('email-already-exists');
        }
    }

    if (isAdmin(request) && userId !== auth.artifacts.id) {
        // admins can update other users without confirmation
        data.email = payload.email;
        data.activateToken = payload.activateToken;
        data.role = payload.role;
        if (payload.password) {
            data.pwd = await hashPassword(payload.password);
        }
    } else {
        // all users need to confirm their email and password changes
        if (payload.email) {
            // check if email has changed
            const oldUser = await User.findByPk(userId);
            if (oldUser.email !== payload.email) {
                const token = generateToken();
                // set activate token (will be set in User.update call below)
                data.activate_token = token;
                // log new email to actions
                await logAction(userId, 'email-change-request', {
                    'old-email': oldUser.email,
                    'new-email': payload.email,
                    token
                });
                // send email-confirmation email
                const { https, domain } = config('frontend');
                await server.app.events.emit(request.server.app.event.SEND_EMAIL, {
                    type: 'change-email',
                    to: payload.email,
                    language: oldUser.language,
                    data: {
                        old_email: oldUser.email,
                        new_email: payload.email,
                        confirmation_link: `${
                            https ? 'https' : 'http'
                        }://${domain}/account/profile?token=${token}`
                    }
                });
            }
        }
        if (payload.password) {
            if (!payload.oldPassword) {
                return Boom.unauthorized(
                    'You need to provide the current password in order to change it.'
                );
            }
            // compare old password to current password
            const oldUser = await User.findByPk(userId, { attributes: ['pwd'] });

            const isValid = await comparePassword(payload.oldPassword, oldUser.pwd, {
                userId
            });

            if (!isValid) {
                return Boom.unauthorized('The old password is wrong');
            }
            data.pwd = await hashPassword(payload.password);
        }
    }

    await User.update(decamelizeKeys(data), {
        where: { id: userId }
    });

    const updatedAt = new Date().toISOString();
    const user = await getUser(request, h);

    return {
        ...user,
        updatedAt
    };
}

async function deleteUser(request, h) {
    const { auth, server, payload } = request;
    const { id } = request.params;
    const { isAdmin, userIsDeleted, comparePassword } = server.methods;

    await userIsDeleted(id);

    const isSameUser = id === auth.artifacts.id;

    if (!isAdmin(request) && !isSameUser) {
        return Boom.forbidden('You can only delete your account');
    }

    if (!isAdmin(request) && (!payload.email || !payload.password)) {
        return Boom.badRequest(
            'You need to provide email and password to confirm account deletion.'
        );
    }

    const user = await User.findByPk(id, { attributes: ['email', 'role', 'pwd'] });
    if (!isAdmin(request)) {
        // check email
        if (payload.email !== user.email) {
            return Boom.badRequest('Wrong email address');
        }

        // check password
        const isValid = await comparePassword(payload.password, user.pwd, {
            userId: user.id
        });

        if (!isValid) {
            return Boom.badRequest('Wrong passsword');
        }
    }

    if (user.role === 'admin') {
        return Boom.forbidden('Cannot delete admin account');
    }

    const teams = await UserTeam.count({
        where: {
            team_role: 'owner',
            user_id: id
        }
    });

    if (teams > 0) {
        return Boom.conflict('delete-or-transfer-teams-first');
    }

    await User.update(
        { email: 'DELETED', name: 'DELETED', pwd: 'DELETED', website: 'DELETED', deleted: true },
        { where: { id } }
    );

    await request.server.methods.logAction(id, 'user/delete');

    const response = h.response().code(204);

    if (isSameUser) {
        const { sessionID } = server.methods.config('api');
        response.unstate(sessionID);

        const session = await Session.findByPk(request.auth.credentials.session, {
            attributes: ['id']
        });

        if (session) {
            await session.destroy();
        }
    }

    await server.app.events.emit(server.app.event.USER_DELETED, {
        id
    });

    return response;
}

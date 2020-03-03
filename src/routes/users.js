const Joi = require('@hapi/joi');
const Boom = require('@hapi/boom');
const { decamelize, decamelizeKeys, camelizeKeys } = require('humps');
const set = require('lodash/set');
const keyBy = require('lodash/keyBy');
const { setUserData } = require('@datawrapper/orm/utils/userData');
const { logAction } = require('@datawrapper/orm/utils/action');
const { User, Chart, Team, UserTeam, Session } = require('@datawrapper/orm/models');
const { queryUsers } = require('../utils/raw-queries');

const { createResponseConfig, noContentResponse, listResponse } = require('../schemas/response.js');

const userResponse = createResponseConfig({
    schema: Joi.object({
        id: Joi.number().integer(),
        email: Joi.string()
    }).unknown()
});

const { Op } = require('@datawrapper/orm').db;
const attributes = ['id', 'email', 'name', 'role', 'language'];

const createUserPayloadValidation = [
    // normal sign-up
    Joi.object({
        name: Joi.string()
            .allow(null)
            .example('Carol Danvers')
            .description('Name of the user that should get created. This can be omitted.'),
        email: Joi.string()
            .email()
            .required()
            .example('cpt-marvel@shield.com')
            .description('User email address'),
        role: Joi.string()
            .valid('editor', 'admin')
            .description('User role. This can be omitted.'),
        language: Joi.string()
            .example('en_US')
            .description('User language preference. This can be omitted.'),
        password: Joi.string()
            .example('13-binary-1968')
            .min(8)
            .required()
            .description('Strong user password.'),
        invitation: Joi.boolean()
            .valid(false)
            .allow(null)
    }),
    // for invitation sign-ups
    Joi.object({
        email: Joi.string()
            .email()
            .required()
            .example('cpt-marvel@shield.com')
            .description('User email address'),
        invitation: Joi.boolean()
            .valid(true)
            .required(),
        chartId: Joi.string(),
        role: Joi.string()
            .valid('editor', 'admin')
            .description('User role. This can be omitted.')
    })
];

module.exports = {
    name: 'users-routes',
    version: '1.0.0',
    register: (server, options) => {
        server.route({
            method: 'GET',
            path: '/',
            options: {
                tags: ['api'],
                description: 'List users',
                validate: {
                    query: Joi.object({
                        teamId: Joi.string().description('Filter users by team.'),
                        search: Joi.string().description('Search for a user.'),
                        order: Joi.string()
                            .uppercase()
                            .valid('ASC', 'DESC')
                            .default('ASC')
                            .description('Result order (ascending or descending)'),
                        orderBy: Joi.string()
                            .valid('id', 'email', 'name', 'createdAt', 'chartCount')
                            .default('id')
                            .description('Attribute to order by'),
                        limit: Joi.number()
                            .integer()
                            .default(100)
                            .description('Maximum items to fetch. Useful for pagination.'),
                        offset: Joi.number()
                            .integer()
                            .default(0)
                            .description('Number of items to skip. Useful for pagination.')
                    })
                },
                response: listResponse
            },
            handler: getAllUsers
        });

        server.route({
            method: 'GET',
            path: '/{id}',
            options: {
                tags: ['api'],
                description: 'Fetch user information',
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

        server.route({
            method: 'PATCH',
            path: '/{id}',
            options: {
                tags: ['api'],
                description: 'Update user information',
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

        server.route({
            method: 'POST',
            path: '/{id}/setup',
            options: {
                validate: {
                    params: Joi.object({
                        id: Joi.number()
                            .required()
                            .description('User ID')
                    })
                }
            },
            handler: handleSetup
        });

        server.route({
            method: 'POST',
            path: '/',
            options: {
                auth: false,
                validate: {
                    payload: createUserPayloadValidation
                }
            },
            handler: createUser
        });

        server.route({
            method: 'DELETE',
            path: '/{id}',
            options: {
                tags: ['api'],
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

        server.route({
            method: 'PATCH',
            path: '/{id}/settings',
            options: {
                tags: ['api'],
                description: 'Update user settings',
                validate: {
                    params: {
                        id: Joi.number()
                            .required()
                            .description('User ID')
                    },
                    payload: {
                        activeTeam: Joi.string()
                            .allow(null)
                            .example('teamxyz')
                            .description('The active team for the user')
                    }
                },
                response: createResponseConfig({
                    schema: Joi.object({
                        activeTeam: Joi.string(),
                        updatedAt: Joi.date()
                    }).unknown()
                })
            },
            handler: editUserSettings
        });

        server.method('userIsDeleted', isDeleted);
    },
    createUserPayloadValidation
};

async function isDeleted(id) {
    const user = await User.findByPk(id, {
        attributes: ['email']
    });

    if (!user || user.email === 'DELETED') {
        throw Boom.notFound();
    }
}

function serializeTeam(team) {
    return {
        id: team.id,
        name: team.name,
        url: `/v3/teams/${team.id}`
    };
}

async function getAllUsers(request, h) {
    const { query, auth, url, server } = request;
    const isAdmin = server.methods.isAdmin(request);

    const userList = {
        list: [],
        total: 0
    };

    const { rows, count } = await queryUsers({
        attributes: ['user.id', 'COUNT(chart.id) AS chart_count'],
        orderBy: decamelize(
            query.orderBy === 'createdAt' ? `user.${query.orderBy}` : query.orderBy
        ),
        order: query.order,
        search: query.search,
        limit: query.limit,
        offset: query.offset,
        teamId: isAdmin ? query.teamId : null
    });

    const options = {
        attributes,
        where: {
            id: { [Op.in]: rows.map(row => row.id) }
        },
        include: [
            {
                model: Team,
                attributes: ['id', 'name']
            }
        ]
    };

    if (isAdmin) {
        options.attributes = options.attributes.concat([
            'created_at',
            'activate_token',
            'reset_password_token'
        ]);
    } else {
        set(options, ['where', 'id'], auth.artifacts.id);
    }

    const users = await User.findAll(options);
    const keyedUsers = keyBy(users, 'id');

    userList.total = count;
    userList.list = rows.map((row, i) => {
        const { role, dataValues } = keyedUsers[row.id];

        const { teams, ...data } = dataValues;

        if (teams) {
            data.teams = teams.map(serializeTeam);
        }

        return camelizeKeys({
            ...data,
            role,
            chartCount: row.chart_count,
            url: `${url.pathname}/${data.id}`
        });
    });

    if (query.limit + query.offset < count) {
        const nextParams = new URLSearchParams({
            ...query,
            offset: query.limit + query.offset,
            limit: query.limit
        });

        set(userList, 'next', `${url.pathname}?${nextParams.toString()}`);
    }

    return userList;
}

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

async function editUserSettings(request, h) {
    const { auth, params } = request;
    const userId = params.id;

    await request.server.methods.userIsDeleted(userId);

    if (userId !== auth.artifacts.id) {
        request.server.methods.isAdmin(request, { throwError: true });
    }

    const result = {};

    if (request.payload.activeTeam !== undefined) {
        let teamId = '%none%';
        if (request.payload.activeTeam !== null) {
            const team = await Team.findByPk(request.payload.activeTeam);
            if (team) teamId = team.id;
            else return Boom.notFound('there is no team with that id');
        }

        await setUserData(userId, 'active_team', teamId);
        result.activeTeam = teamId !== '%none%' ? teamId : null;
    }

    const updatedAt = new Date().toISOString();

    return {
        ...result,
        updatedAt
    };
}

async function createUser(request, h) {
    const { hashPassword, isAdmin, generateToken, config } = request.server.methods;
    const { password = '', ...data } = request.payload;

    const existingUser = await User.findOne({ where: { email: data.email } });

    if (existingUser) {
        return Boom.conflict('User already exists');
    }

    const isInvitation = !!data.invitation;
    const newUser = {
        role: 'pending',
        name: data.name,
        email: data.email,
        language: data.language, // session language?
        activate_token: generateToken()
    };

    if (!isInvitation) {
        if (password === '') {
            return Boom.badRequest('Password must not be empty');
        }
        const hash = await hashPassword(password);
        newUser.pwd = hash;
    } else {
        newUser.pwd = '';
    }

    if (data.role && isAdmin(request)) {
        // only admins are allowed to set a user role
        newUser.role = data.role;
    }

    const user = await User.create(newUser);

    const { count } = await Chart.findAndCountAll({ where: { author_id: user.id } });

    const { https, domain } = config('frontend');
    const accountBaseUrl = `${https ? 'https' : 'http'}://${domain}/account`;

    // send activation/invitation link
    await request.server.app.events.emit(request.server.app.event.SEND_EMAIL, {
        type: isInvitation ? 'new-invite' : 'activation',
        to: newUser.email,
        language: newUser.language,
        data: isInvitation
            ? {
                  confirmation_link: `${accountBaseUrl}/invite/${newUser.activate_token}${
                      data.chartId ? `?chart=${data.chartId}` : ''
                  }`
              }
            : {
                  activation_link: `${accountBaseUrl}/activate/${newUser.activate_token}`
              }
    });

    return h
        .response({
            ...camelizeKeys(user.serialize()),
            url: `${request.url.pathname}/${user.id}`,
            chartCount: count,
            createdAt: request.server.methods.isAdmin(request) ? user.created_at : undefined
        })
        .code(201);
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

        response.header('Clear-Site-Data', '"cookies", "storage", "executionContexts"');
    }

    await server.app.events.emit(server.app.event.USER_DELETED, {
        id
    });

    return response;
}

async function handleSetup(request, h) {
    const { params, server } = request;
    const { generateToken, isAdmin, config } = server.methods;

    if (!isAdmin(request)) return Boom.unauthorized();

    const user = await User.findByPk(params.id, { attributes: ['id', 'email', 'language'] });

    if (!user) return Boom.notFound();

    const token = generateToken();

    await user.update({ pwd: '', activate_token: token });

    const { https, domain } = config('frontend');
    await server.app.events.emit(request.server.app.event.SEND_EMAIL, {
        type: 'user-setup',
        to: user.email,
        language: user.language,
        data: {
            email: user.email,
            invite_link: `${https ? 'https' : 'http'}://${domain}/account/invite/${token}`
        }
    });

    return { token };
}

const Joi = require('@hapi/joi');
const Boom = require('@hapi/boom');
const sequelize = require('sequelize');
const bcrypt = require('bcryptjs');
const { decamelize, camelizeKeys } = require('humps');
const set = require('lodash/set');
const keyBy = require('lodash/keyBy');
const { User, Chart, Team } = require('@datawrapper/orm/models');
const { queryUsers } = require('../utils/raw-queries');

const { Op } = sequelize;
const attributes = ['id', 'email', 'name', 'role', 'language'];

module.exports = {
    name: 'users-routes',
    version: '1.0.0',
    register: (server, options) => {
        server.route({
            method: 'GET',
            path: '/',
            options: {
                tags: ['api'],
                validate: {
                    query: {
                        teamId: Joi.string().description('Filter users by team.'),
                        search: Joi.string().description('Search for a user.'),
                        order: Joi.string()
                            .uppercase()
                            .valid(['ASC', 'DESC'])
                            .default('ASC')
                            .description('Result order (ascending or descending)'),
                        orderBy: Joi.string()
                            .valid(['id', 'email', 'name', 'createdAt', 'chartCount'])
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
                    }
                }
            },
            handler: getAllUsers
        });

        server.route({
            method: 'GET',
            path: '/{id}',
            options: {
                tags: ['api'],
                validate: {
                    params: {
                        id: Joi.number()
                            .required()
                            .description('User ID')
                    }
                }
            },
            handler: getUser
        });

        server.route({
            method: 'PATCH',
            path: '/{id}',
            options: {
                tags: ['api'],
                validate: {
                    params: {
                        id: Joi.number()
                            .required()
                            .description('User ID')
                    },
                    payload: {
                        name: Joi.string()
                            .allow(null)
                            .example('Rocket Raccoon')
                            .description('New user name'),
                        email: Joi.string()
                            .email()
                            .example('89P13@half.world')
                            .description('New user email address'),
                        role: Joi.string()
                            .valid(['editor', 'admin'])
                            .description('New user role. Can only be changed by admins.'),
                        language: Joi.string()
                            .example('en_US')
                            .description('New language preference.')
                    }
                }
            },
            handler: editUser
        });

        server.route({
            method: 'POST',
            path: '/{id}/setup',
            options: {
                tags: ['api'],
                validate: {
                    params: {
                        id: Joi.number()
                            .required()
                            .description('User ID')
                    }
                }
            },
            handler: handleSetup
        });

        server.route({
            method: 'POST',
            path: '/',
            options: {
                auth: false,
                tags: ['api'],
                validate: {
                    payload: Joi.object({
                        name: Joi.string()
                            .allow(null)
                            .example('Carol Danvers')
                            .description(
                                'Name of the user that should get created. This can be omitted.'
                            ),
                        email: Joi.string()
                            .email()
                            .required()
                            .example('cpt-marvel@shield.com')
                            .description('User email address'),
                        role: Joi.string()
                            .valid(['editor', 'admin'])
                            .description('User role. This can be omitted.'),
                        language: Joi.string()
                            .example('en_US')
                            .description('User language preference. This can be omitted.'),
                        password: Joi.string()
                            .example('13-binary-1968')
                            .description('Strong user password.')
                    }).unknown()
                }
            },
            handler: createUser
        });

        server.route({
            method: 'DELETE',
            path: '/{id}',
            options: {
                tags: ['api'],
                validate: {
                    params: {
                        id: Joi.number()
                            .required()
                            .description('User ID')
                    },
                    payload: {
                        email: Joi.string()
                            .email()
                            .required()
                            .example('james.barnes@shield.com')
                            .description('User email address to confirm deletion.')
                    }
                }
            },
            handler: deleteUser
        });

        server.method('userIsDeleted', isDeleted);

        const { hashRounds = 15 } = server.methods.config('api');
        server.method('hashPassword', hashPassword(hashRounds));
    }
};

async function isDeleted(id) {
    const user = await User.findByPk(id, {
        attributes: ['email']
    });

    if (!user || user.email === 'DELETED') {
        throw Boom.notFound();
    }
}

function hashPassword(hashRounds) {
    return async function(password) {
        return bcrypt.hash(password, hashRounds);
    };
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
    let isAdmin = server.methods.isAdmin(request);

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
    let isAdmin = request.server.methods.isAdmin(request);

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
    const { auth, params } = request;
    const userId = params.id;

    await request.server.methods.userIsDeleted(userId);

    if (userId !== auth.artifacts.id) {
        request.server.methods.isAdmin(request, { throwError: true });
    }

    await User.update(request.payload, {
        where: { id: userId }
    });

    const updatedAt = new Date().toISOString();
    const user = await getUser(request, h);

    return {
        ...user,
        updatedAt
    };
}

async function createUser(request, h) {
    const { password = '', ...data } = request.payload;

    const existingUser = await User.findOne({ where: { email: data.email } });

    if (existingUser) {
        return Boom.conflict('User already exists');
    }

    const hash = password === '' ? password : await request.server.methods.hashPassword(password);

    const newUser = {
        role: 'pending',
        pwd: hash,
        name: null,
        ...data
    };

    const { role, dataValues } = await User.create(newUser);
    const { pwd, ...user } = dataValues;

    const { count } = await Chart.findAndCountAll({ where: { author_id: user.id } });

    return h
        .response({
            ...camelizeKeys(user),
            role,
            url: `${request.url.pathname}/${user.id}`,
            chartCount: count,
            createdAt: request.server.methods.isAdmin(request) ? user.created_at : undefined
        })
        .code(201);
}

async function deleteUser(request, h) {
    const { auth, server, payload } = request;
    const { id } = request.params;

    await server.methods.userIsDeleted(id);

    const isSameUser = id === auth.artifacts.id;

    if (!server.methods.isAdmin(request) && !isSameUser) {
        return Boom.forbidden('You can only delete your account');
    }

    const user = await User.findByPk(id, { attributes: ['email', 'role'] });
    if (payload.email !== user.email) {
        return Boom.badRequest('Wrong email address');
    }

    if (user.role === 'admin') {
        return Boom.forbidden('Can not delete admin account');
    }

    await User.update(
        { email: 'DELETED', name: 'DELETED', pwd: 'DELETED', website: 'DELETED', deleted: true },
        { where: { id } }
    );

    const response = h.response().code(204);

    if (isSameUser) {
        const { sessionID } = server.methods.config('api');
        response.unstate(sessionID);
    }

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

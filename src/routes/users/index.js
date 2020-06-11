const Joi = require('@hapi/joi');
const Boom = require('@hapi/boom');
const { decamelize, camelizeKeys } = require('humps');
const set = require('lodash/set');
const keyBy = require('lodash/keyBy');
const { User, Chart, Team } = require('@datawrapper/orm/models');
const { queryUsers } = require('../../utils/raw-queries');
const { serializeTeam } = require('../teams/utils');
const { listResponse } = require('../../schemas/response.js');

const { Op } = require('@datawrapper/orm').db;
const attributes = ['id', 'email', 'name', 'role', 'language'];

const { createUserPayload } = require('../../schemas/payload');

module.exports = {
    name: 'routes/users',
    version: '1.0.0',
    register: (server, options) => {
        // GET /v3/users
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
            method: 'POST',
            path: '/',
            options: {
                auth: false,
                validate: {
                    payload: createUserPayload
                }
            },
            handler: createUser
        });

        server.register(require('./{id}'), {
            routes: {
                prefix: '/{id}'
            }
        });

        server.method('userIsDeleted', isDeleted);
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
        type: isInvitation ? (data.chartId ? 'new-invite' : 'mobile-activation') : 'activation',
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

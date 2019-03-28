const Joi = require('joi');
const Boom = require('boom');
const sequelize = require('sequelize');
const nanoid = require('nanoid');
const bcrypt = require('bcrypt');
const { decamelize, camelizeKeys } = require('humps');
const set = require('lodash/set');
const { User, Chart } = require('@datawrapper/orm/models');

const { Op } = sequelize;
const attributes = ['id', 'email', 'name', 'role', 'language', 'created_at'];

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
                        search: Joi.string(),
                        order: Joi.string()
                            .uppercase()
                            .valid(['ASC', 'DESC'])
                            .default('ASC'),
                        orderBy: Joi.string()
                            .valid(['id', 'email', 'name', 'createdAt'])
                            .default('id'),
                        limit: Joi.number()
                            .integer()
                            .default(100),
                        offset: Joi.number()
                            .integer()
                            .default(0)
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
                        id: Joi.number().required()
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
                        id: Joi.number().required()
                    },
                    payload: {
                        name: Joi.string(),
                        email: Joi.string().email(),
                        role: Joi.string().valid(['editor', 'admin']),
                        language: Joi.string()
                    }
                }
            },
            handler: editUser
        });

        server.route({
            method: 'POST',
            path: '/',
            options: {
                auth: false,
                tags: ['api'],
                validate: {
                    payload: {
                        name: Joi.string(),
                        email: Joi.string()
                            .email()
                            .required(),
                        role: Joi.string().valid(['editor', 'admin']),
                        language: Joi.string(),
                        password: Joi.string()
                    }
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
                        id: Joi.number().required()
                    },
                    payload: {
                        email: Joi.string()
                            .email()
                            .required()
                    }
                }
            },
            handler: deleteUser
        });

        server.method('userIsDeleted', isDeleted);
    }
};

async function isDeleted(id) {
    const user = await User.findByPk(id, {
        attributes: ['email']
    });

    if (user.email === 'DELETED') {
        throw Boom.notFound();
    }
}

async function getAllUsers(request, h) {
    const { query, auth, url } = request;

    const options = {
        order: [[decamelize(query.orderBy), query.order]],
        attributes,
        include: [
            {
                model: Chart,
                attributes: ['id']
            }
        ],
        where: {
            email: {
                [Op.not]: 'DELETED'
            }
        },
        limit: query.limit,
        offset: query.offset
    };

    if (query.search) {
        set(options, ['where', 'email', Op.like], `%${query.search}%`);
    }

    if (!request.server.methods.isAdmin(request)) {
        set(options, ['where', 'id'], auth.artifacts.id);
    }

    const [users, count] = await Promise.all([
        User.findAll(options),
        User.count({ where: options.where })
    ]);

    const userList = {
        list: users.map(({ dataValues }) => {
            const { charts, ...data } = dataValues;
            return camelizeKeys({
                ...data,
                chartCount: charts.length,
                url: `${url.pathname}/${data.id}`
            });
        }),
        total: count
    };

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

    await request.server.methods.userIsDeleted(userId);

    if (userId !== auth.artifacts.id) {
        request.server.methods.isAdmin(request, { throwError: true });
    }

    const { dataValues } = await User.findByPk(userId, {
        attributes,
        include: [{ model: Chart, attributes: ['id'] }]
    });

    const { charts, ...data } = dataValues;
    return camelizeKeys({
        ...data,
        chartCount: charts.length,
        url: `${url.pathname}`
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
    const { password = nanoid(), ...data } = request.payload;
    const hash = await bcrypt.hash(password, 14);

    const newUser = {
        role: 'pending',
        pwd: hash,
        ...data
    };

    const userModel = await User.create(newUser);
    const { pwd, ...user } = userModel.dataValues;
    return h.response(user).code(201);
}

async function deleteUser(request, h) {
    const { id } = request.params;

    await request.server.methods.userIsDeleted(id);

    if (!request.server.methods.isAdmin(request)) {
        if (id !== request.auth.artifacts.id) {
            return Boom.forbidden('You can only delete your account');
        }

        const { email } = request.payload;
        const user = await User.findByPk(id, { attributes: ['email'] });

        if (email !== user.email) {
            return Boom.badRequest('Wrong email address');
        }
    }

    await User.update(
        { email: 'DELETED', name: 'DELETED', pwd: 'DELETED', website: 'DELETED' },
        { where: { id } }
    );

    return h.response().code(204);
}

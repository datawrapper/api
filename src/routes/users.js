const Joi = require('joi');
const sequelize = require('sequelize');
const nanoid = require('nanoid');
const bcrypt = require('bcrypt');
const { decamelize, camelizeKeys } = require('humps');
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
            config: {
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
                        offset: Joi.number().integer()
                    }
                }
            },
            handler: getAllUsers
        });

        server.route({
            method: 'GET',
            path: '/{id}',
            config: {
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
            config: {
                tags: ['api'],
                validate: {
                    params: {
                        id: Joi.number().required()
                    },
                    payload: {
                        name: Joi.string(),
                        email: Joi.string().email(),
                        role: Joi.string().valid([
                            'admin',
                            'editor',
                            'pending',
                            'guest',
                            'sysadmin',
                            'graphic-editor'
                        ]),
                        language: Joi.string()
                    }
                }
            },
            handler: editUser
        });

        server.route({
            method: 'POST',
            path: '/',
            config: {
                tags: ['api'],
                validate: {
                    payload: {
                        name: Joi.string(),
                        email: Joi.string()
                            .email()
                            .required(),
                        role: Joi.string().valid([
                            'admin',
                            'editor',
                            'pending',
                            'guest',
                            'sysadmin',
                            'graphic-editor'
                        ]),
                        language: Joi.string()
                    }
                }
            },
            handler: createUser
        });
    }
};

async function getAllUsers(request, h) {
    const { query } = request;

    const options = {
        order: [[decamelize(query.orderBy), query.order]],
        attributes,
        include: [
            {
                model: Chart,
                attributes: ['id']
            }
        ],
        limit: query.limit,
        offset: query.offset
    };

    if (query.search) {
        options.where = {
            email: {
                [Op.like]: `%${query.search}%`
            }
        };
    }

    const [users, count] = await Promise.all([
        User.findAll(options),
        User.count({ where: options.where })
    ]);

    return {
        list: users.map(({ dataValues }) => {
            const { charts, ...data } = dataValues;
            return camelizeKeys({ ...data, chartCount: charts.length });
        }),
        total: count
    };
}

async function getUser(request, h) {
    const userId = request.params.id;
    const { dataValues } = await User.findByPk(userId, {
        attributes,
        include: [{ model: Chart, attributes: ['id'] }]
    });

    const { charts, ...data } = dataValues;
    return camelizeKeys({
        ...data,
        chartCount: charts.length
    });
}

async function editUser(request, h) {
    const userId = request.params.id;
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
    const password = await bcrypt.hash(nanoid(), 14);

    const newUser = {
        role: 'pending',
        ...request.payload,
        pwd: password
    };

    const userModel = await User.create(newUser);
    const { pwd, ...user } = userModel.dataValues;
    return h.response(user).code(201);
}

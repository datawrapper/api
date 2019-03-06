const Joi = require('joi');
const { getAllUsers, getUser, editUser, createUser } = require('./users');
const { login, logout } = require('./auth');

const routes = {
    pkg: require('../../package.json'),
    register: (server, options) => {
        server.route({
            method: 'GET',
            path: '/',
            config: {
                tags: ['api'],
                auth: false
            },
            handler: (request, h) => h.redirect('/swagger.json')
        });

        server.route({
            method: 'POST',
            path: '/auth/login',
            config: {
                tags: ['api'],
                auth: false,
                validate: {
                    payload: {
                        email: Joi.string()
                            .email()
                            .required(),
                        password: Joi.string()
                            .min(8)
                            .required()
                    }
                }
            },
            handler: login
        });

        server.route({
            method: 'POST',
            path: '/auth/logout',
            config: {
                tags: ['api'],
                auth: 'session'
            },
            handler: logout
        });

        server.route({
            method: 'GET',
            path: '/users',
            config: {
                tags: ['api'],
                auth: {
                    strategies: ['admin']
                },
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
            path: '/users/{id}',
            config: {
                tags: ['api'],
                auth: {
                    strategies: ['admin']
                },
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
            path: '/users/{id}',
            config: {
                tags: ['api'],
                auth: {
                    strategies: ['admin']
                },
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
            path: '/users',
            config: {
                tags: ['api'],
                auth: {
                    strategies: ['admin']
                },
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

module.exports = routes;

const Joi = require('joi');
const { getAllUsers, getUser, editUser } = require('./admin-users');

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
            method: 'GET',
            path: '/admin/users',
            config: {
                auth: {
                    strategies: ['session', 'simple']
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
            path: '/admin/users/{id}',
            config: {
                auth: {
                    strategies: ['session', 'simple']
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
            method: 'PUT',
            path: '/admin/users/{id}',
            config: {
                auth: {
                    strategies: ['session', 'simple']
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
    }
};

module.exports = routes;

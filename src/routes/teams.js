const Joi = require('joi');
const Boom = require('boom');
const { Op } = require('sequelize');
const set = require('lodash/set');
const { decamelize, camelizeKeys } = require('humps');
const { Team, User } = require('@datawrapper/orm/models');

module.exports = {
    name: 'teams-routes',
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
                            .valid(['name', 'createdAt'])
                            .default('name'),
                        limit: Joi.number()
                            .integer()
                            .default(100),
                        offset: Joi.number()
                            .integer()
                            .default(0)
                    }
                }
            },
            handler: getAllTeams
        });

        server.route({
            method: 'GET',
            path: `/{id}`,
            options: {
                tags: ['api'],
                validate: {
                    params: {
                        id: Joi.string().required()
                    }
                }
            },
            handler: getTeam
        });

        server.route({
            method: 'GET',
            path: `/{id}/members`,
            options: {
                tags: ['api'],
                validate: {
                    params: {
                        id: Joi.string().required()
                    },
                    query: {
                        search: Joi.string(),
                        order: Joi.string()
                            .uppercase()
                            .valid(['ASC', 'DESC'])
                            .default('ASC'),
                        orderBy: Joi.string()
                            .valid(['name', 'createdAt'])
                            .default('name'),
                        limit: Joi.number()
                            .integer()
                            .default(100),
                        offset: Joi.number()
                            .integer()
                            .default(0)
                    }
                }
            },
            handler: getTeamMembers
        });
    }
};

async function getAllTeams(request, h) {
    const { query, auth, url, server } = request;

    const options = {
        attributes: {
            exclude: ['deleted']
        },
        include: [
            {
                model: User,
                attributes: ['id']
            }
        ],
        where: {
            deleted: {
                [Op.not]: true
            }
        },
        limit: query.limit,
        offset: query.offset,
        distinct: true
    };

    if (query.search) {
        set(
            options,
            ['where', Op.or],
            [
                {
                    name: { [Op.like]: `%${query.search}%` }
                },
                {
                    id: { [Op.like]: `%${query.search}%` }
                }
            ]
        );
    }

    if (!server.methods.isAdmin(request)) {
        set(options, ['include', 0, 'where', 'id'], auth.artifacts.id);
    }

    const { rows, count } = await Team.findAndCountAll(options);

    const chartList = {
        list: rows.map(({ dataValues }) => {
            const { users, ...data } = dataValues;
            return camelizeKeys({
                ...data,
                memberCount: users.length,
                url: `${url.pathname}/${dataValues.id}`
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

        set(chartList, 'next', `${url.pathname}?${nextParams.toString()}`);
    }

    return chartList;
}

async function getTeam(request, h) {
    const { url, server, auth, params } = request;
    const options = {
        attributes: {
            exclude: ['deleted']
        },
        include: [
            {
                model: User,
                attributes: ['id', 'email', 'name']
            }
        ],
        where: {
            id: params.id,
            deleted: {
                [Op.not]: true
            }
        }
    };

    if (!server.methods.isAdmin(request)) {
        set(options, ['include', 0, 'where', 'id'], auth.artifacts.id);
    }

    const team = await Team.findOne(options);

    if (!team) {
        return Boom.notFound();
    }

    const { users, ...data } = team.dataValues;

    return camelizeKeys({
        ...data,
        memberCount: users.length,
        url: url.pathname
    });
}

async function getTeamMembers(request, h) {
    const { query, params } = request;
    const options = {
        order: [[decamelize(query.orderBy), query.order]],
        attributes: ['id', 'name', 'email'],
        include: [
            {
                model: Team,
                attributes: ['id'],
                where: {
                    id: params.id,
                    deleted: {
                        [Op.not]: true
                    }
                }
            }
        ],
        limit: query.limit,
        offset: query.offset,
        distinct: true
    };

    if (query.search) {
        set(options, ['where', 'email', Op.like], `%${query.search}%`);
    }

    const { rows, count } = await User.findAndCountAll(options);

    if (!rows.length) {
        return Boom.notFound();
    }

    return {
        list: rows.map(user => ({
            id: user.id,
            name: user.name,
            email: user.email,
            url: `/v3/users/${user.id}`
        })),
        total: count
    };
}

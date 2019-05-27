const Joi = require('@hapi/joi');
const Boom = require('@hapi/boom');
const { Op } = require('sequelize');
const set = require('lodash/set');
const { decamelize, decamelizeKeys, camelizeKeys } = require('humps');
const { Team, User, UserTeam } = require('@datawrapper/orm/models');

const ROLES = ['owner', 'admin', 'member'];

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
                        search: Joi.string().description(
                            'Search for a team name or id including this term.'
                        ),
                        order: Joi.string()
                            .uppercase()
                            .valid(['ASC', 'DESC'])
                            .default('ASC')
                            .description('Result order (ascending or descending)'),
                        orderBy: Joi.string()
                            .valid(['name', 'createdAt'])
                            .default('name')
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
            handler: getAllTeams
        });

        server.route({
            method: 'GET',
            path: `/{id}`,
            options: {
                tags: ['api'],
                validate: {
                    params: {
                        id: Joi.string()
                            .required()
                            .description('ID of the team to fetch.')
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
                        id: Joi.string()
                            .required()
                            .description('ID of the team to fetch members for.')
                    },
                    query: {
                        search: Joi.string().description(
                            'Search for a team name or id including this term.'
                        ),
                        order: Joi.string()
                            .uppercase()
                            .valid(['ASC', 'DESC'])
                            .default('ASC')
                            .description('Result order (ascending or descending)'),
                        orderBy: Joi.string()
                            .valid(['name', 'createdAt'])
                            .default('name')
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
            handler: getTeamMembers
        });

        server.route({
            method: 'DELETE',
            path: `/{id}/members/{userId}`,
            options: {
                tags: ['api'],
                validate: {
                    params: {
                        id: Joi.string()
                            .required()
                            .description('ID of the team'),
                        userId: Joi.number()
                            .required()
                            .description('ID of the team member to remove from team.')
                    }
                }
            },
            handler: deleteTeamMember
        });

        server.route({
            method: 'DELETE',
            path: `/{id}/members`,
            options: {
                tags: ['api'],
                validate: {
                    params: {
                        id: Joi.string()
                            .required()
                            .description('ID of the team to delete.')
                    }
                }
            },
            handler: deleteTeam
        });

        server.route({
            method: 'POST',
            path: `/`,
            options: {
                tags: ['api'],
                validate: {
                    payload: {
                        id: Joi.string()
                            .required()
                            .example('revengers'),
                        name: Joi.string()
                            .required()
                            .example('Revengers'),
                        settings: Joi.object({
                            type: Joi.string()
                        }),
                        defaultTheme: Joi.string().example('space')
                    }
                }
            },
            handler: createTeam
        });

        server.route({
            method: 'PATCH',
            path: `/{id}`,
            options: {
                tags: ['api'],
                validate: {
                    params: {
                        id: Joi.string()
                            .required()
                            .description('Team ID')
                    },
                    payload: {
                        name: Joi.string().example('New Revengers'),
                        settings: Joi.object({
                            type: Joi.string()
                        }),
                        defaultTheme: Joi.string().example('light')
                    }
                }
            },
            handler: editTeam
        });

        server.route({
            method: 'POST',
            path: `/{id}/members`,
            options: {
                tags: ['api'],
                validate: {
                    params: {
                        id: Joi.string()
                            .required()
                            .description('Team ID (eg. guardians-of-the-galaxy)')
                    },
                    payload: {
                        email: Joi.string()
                            .email()
                            .required()
                            .example('thor@gmail.com')
                    }
                }
            },
            handler: addTeamMember
        });

        server.route({
            method: 'PUT',
            path: `/{id}/members/{userId}/status`,
            options: {
                tags: ['api'],
                validate: {
                    params: {
                        id: Joi.string()
                            .required()
                            .description('Team ID'),
                        userId: Joi.number()
                            .integer()
                            .required()
                            .description('ID of the team member you want to change the status of.')
                    },
                    payload: {
                        status: Joi.string()
                            .valid(ROLES)
                            .required()
                    }
                }
            },
            handler: changeMemberStatus
        });
    }
};

async function getMemberRole(userId, teamId) {
    const team = await UserTeam.findOne({
        where: {
            user_id: userId,
            organization_id: teamId
        }
    });

    if (!team) {
        throw Boom.unauthorized();
    }

    return ROLES[team.dataValues.team_role];
}

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

    const isAdmin = server.methods.isAdmin(request);
    const hasTeam = !!(await UserTeam.findOne({
        where: {
            user_id: auth.artifacts.id,
            organization_id: params.id
        }
    }));

    if (!hasTeam && !isAdmin) {
        return Boom.unauthorized();
    }

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

    if (!isAdmin) {
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
    const { query, params, auth, server } = request;

    const hasTeam = !!(await UserTeam.findOne({
        where: {
            user_id: auth.artifacts.id,
            organization_id: params.id
        }
    }));

    if (!hasTeam && !server.methods.isAdmin(request)) {
        return Boom.unauthorized();
    }

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

async function editTeam(request, h) {
    const { auth, payload, params, server } = request;

    if (!server.methods.isAdmin(request)) {
        const memberRole = await getMemberRole(auth.artifacts.id, params.id);

        if (memberRole === ROLES[2]) {
            return Boom.unauthorized();
        }
    }

    let data = payload;

    if (data.settings) {
        data.settings = JSON.stringify(data.settings);
    }

    let team = await Team.findOne({
        where: { id: params.id, deleted: { [Op.not]: true } },
        attributes: { exclude: ['deleted'] }
    });

    if (!team) return Boom.notFound();

    team = await team.update(decamelizeKeys(data));

    data = team.dataValues;

    if (typeof data.settings === 'string') {
        data.settings = JSON.parse(data.settings);
    }

    data.updatedAt = new Date().toISOString();
    return camelizeKeys(data);
}

async function deleteTeam(request, h) {
    const { auth, params, server } = request;

    if (!server.methods.isAdmin(request)) {
        const memberRole = await getMemberRole(auth.artifacts.id, params.id);

        if (memberRole !== ROLES[0]) {
            return Boom.unauthorized();
        }
    }

    const updates = await Team.update(
        {
            deleted: true
        },
        {
            where: {
                id: params.id,
                deleted: {
                    [Op.not]: true
                }
            }
        }
    );

    /* no rows got updated, which means the team is already deleted or doesn't exist */
    if (!updates[0]) {
        return Boom.notFound();
    }

    return h.response().code(204);
}

async function deleteTeamMember(request, h) {
    const { auth, params, server } = request;

    const isAdmin = server.methods.isAdmin(request);

    if (!isAdmin) {
        const memberRole = await getMemberRole(auth.artifacts.id, params.id);

        if (memberRole === ROLES[2]) {
            return Boom.unauthorized();
        }
    }

    const row = await UserTeam.findOne({
        where: {
            user_id: params.userId,
            organization_id: params.id
        }
    });

    if (!row) return Boom.notFound();

    if (ROLES[row.dataValues.team_role] === 'owner' && !isAdmin) {
        return Boom.unauthorized('Can not delete team owner.');
    }

    await row.destroy();

    return h.response().code(204);
}

async function createTeam(request, h) {
    const { payload, server } = request;

    server.methods.isAdmin(request, { throwError: true });

    try {
        const team = await Team.create({
            id: payload.id,
            name: payload.name,
            settings: JSON.stringify(payload.settings),
            default_theme: payload.defaultTheme
        });

        const data = team.dataValues;

        if (typeof data.settings === 'string') {
            data.settings = JSON.parse(data.settings);
        }

        return h.response(camelizeKeys(data)).code(201);
    } catch (error) {
        if (error.name === 'SequelizeUniqueConstraintError') {
            return Boom.conflict(`Organization with ID [${payload.id}] already exists.`);
        }
        request.logger.error(error);
        return Boom.conflict();
    }
}

async function addTeamMember(request, h) {
    const { auth, params, payload, server } = request;

    const isAdmin = server.methods.isAdmin(request);

    if (!isAdmin) {
        const memberRole = await getMemberRole(auth.artifacts.id, params.id);

        if (memberRole === ROLES[2]) {
            return Boom.unauthorized();
        }
    }

    let teamCount = await Team.count({
        where: { id: params.id, deleted: { [Op.not]: true } }
    });

    if (!teamCount) return Boom.notFound();

    let user = await User.findOne({
        where: { email: payload.email },
        attributes: ['id', 'email', 'language']
    });

    const token = server.methods.generateToken();
    if (!user && !isAdmin) {
        const passwordToken = server.methods.generateToken();
        const hash = await request.server.methods.hashPassword(passwordToken);
        user = await User.create({
            email: payload.email,
            activate_token: token,
            role: 'pending',
            pwd: hash,
            name: null
        });
    }

    if (!user && isAdmin) {
        return Boom.conflict('User does not exist.');
    }

    const isMember = !!(await UserTeam.findOne({
        where: {
            user_id: user.id,
            organization_id: params.id
        }
    }));

    if (isMember) {
        return Boom.badRequest('User is already member of team.');
    }

    const data = {
        user_id: user.id,
        organization_id: params.id,
        team_role: ROLES[2]
    };

    if (!isAdmin) {
        data.token = token;
    }

    await UserTeam.create(data);

    if (!isAdmin) {
        const { https, domain } = server.methods.config('frontend');
        await server.app.events.emit(server.app.event.SEND_EMAIL, {
            type: 'team-invite',
            to: user.email,
            language: user.language,
            data: {
                activation_link: `${
                    https ? 'https' : 'http'
                }://${domain}/datawrapper-invite/${data.token || 'lol'}`
            }
        });
    }

    return h.response().code(201);
}

async function changeMemberStatus(request, h) {
    const { auth, params, payload, server } = request;

    const isAdmin = server.methods.isAdmin(request);

    if (!isAdmin) {
        const memberRole = await getMemberRole(auth.artifacts.id, params.id);

        if (memberRole === ROLES[2]) {
            return Boom.unauthorized();
        }
    }

    const userTeam = await UserTeam.findOne({
        where: {
            user_id: params.userId,
            organization_id: params.id
        }
    });

    await userTeam.update({
        team_role: payload.status
    });

    return h.response().code(204);
}

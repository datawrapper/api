const Joi = require('@hapi/joi');
const Boom = require('@hapi/boom');
const { Op } = require('@datawrapper/orm').db;
const set = require('lodash/set');
const { decamelize } = require('humps');
const { Chart, Team, User, UserTeam } = require('@datawrapper/orm/models');

const {
    ROLE_OWNER,
    ROLE_ADMIN,
    ROLE_MEMBER,
    ROLES,
    clearPluginCache,
    getMemberRole,
    canChangeMemberStatus
} = require('../utils');

const {
    createResponseConfig,
    noContentResponse,
    listResponse
} = require('../../../schemas/response.js');

module.exports = async (server, options) => {
    // GET /v3/teams/{id}/members
    server.route({
        method: 'GET',
        path: `/members`,
        options: {
            tags: ['api'],
            description: 'List team members',
            notes:
                'Get a list of team members and some additional information like their team role.',
            auth: {
                access: { scope: ['team', 'all'] }
            },
            validate: {
                params: Joi.object({
                    id: Joi.string()
                        .required()
                        .description('ID of the team to fetch members for.')
                }),
                query: Joi.object({
                    search: Joi.string().description(
                        'Search for a team name or id including this term.'
                    ),
                    order: Joi.string()
                        .uppercase()
                        .valid('ASC', 'DESC')
                        .default('ASC')
                        .description('Result order (ascending or descending)'),
                    orderBy: Joi.string()
                        .valid('name', 'createdAt')
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
                })
            },
            response: listResponse
        },
        handler: getTeamMembers
    });

    // POST /v3/teams/{id}/members
    server.route({
        method: 'POST',
        path: `/members`,
        options: {
            description: 'Add a team member',
            auth: {
                access: { scope: ['team', 'all'] }
            },
            validate: {
                params: Joi.object({
                    id: Joi.string()
                        .required()
                        .description('Team ID (eg. guardians-of-the-galaxy)')
                }),
                payload: Joi.object({
                    userId: Joi.number()
                        .integer()
                        .required()
                        .description('ID of the team member you want add.'),
                    role: Joi.string()
                        .valid(...ROLES)
                        .required()
                })
            },
            response: createResponseConfig({
                status: { '201': Joi.any().empty() }
            })
        },
        handler: addTeamMember
    });

    // DELETE /v3/teams/{id}/members/{userId}
    server.route({
        method: 'DELETE',
        path: `/members/{userId}`,
        options: {
            tags: ['api'],
            description: 'Remove a team member',
            auth: {
                access: { scope: ['team', 'all'] }
            },
            validate: {
                params: Joi.object({
                    id: Joi.string()
                        .required()
                        .description('ID of the team'),
                    userId: Joi.number()
                        .required()
                        .description('ID of the team member to remove from team.')
                })
            },
            response: noContentResponse
        },
        handler: deleteTeamMember
    });

    // PUT /v3/teams/{id}/members/{userId}/status
    server.route({
        method: 'PUT',
        path: `/members/{userId}/status`,
        options: {
            tags: ['api'],
            description: 'Set team member status',
            auth: {
                access: { scope: ['team', 'all'] }
            },
            validate: {
                params: Joi.object({
                    id: Joi.string()
                        .required()
                        .description('Team ID'),
                    userId: Joi.number()
                        .integer()
                        .required()
                        .description('ID of the team member you want to change the status of.')
                }),
                payload: Joi.object({
                    status: Joi.string()
                        .valid(...ROLES)
                        .required()
                })
            },
            response: noContentResponse
        },
        handler: changeMemberStatus
    });
};

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

    if (!server.methods.isAdmin(request)) {
        const memberRole = await getMemberRole(auth.artifacts.id, params.id);

        if (memberRole === ROLE_MEMBER) {
            return Boom.unauthorized();
        }
    }

    const options = {
        order: [[decamelize(query.orderBy), query.order]],
        attributes: ['id', 'name', 'email', 'role', 'activate_token'],
        include: [
            {
                model: Team,
                attributes: ['id'],
                where: {
                    id: params.id
                }
            },
            {
                model: Chart,
                attributes: ['id'],
                required: false,
                where: {
                    organization_id: params.id,
                    deleted: {
                        [Op.not]: true
                    },
                    last_edit_step: {
                        [Op.gt]: 1
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

    return {
        list: rows.map(user => {
            const { user_team } = user.teams[0];
            const token = user_team.invite_token;
            return {
                id: user.id,
                name: user.name,
                email: user.email,
                charts: user.charts.length,
                isAdmin: user.role === 'admin' || user.role === 'sysadmin',
                role: user_team.team_role,
                isNewUser: token ? user.activate_token === token : undefined,
                url: `/v3/users/${user.id}`
            };
        }),
        total: count
    };
}

async function changeMemberStatus(request, h) {
    const { auth, params, payload, server } = request;

    const isAdmin = server.methods.isAdmin(request);

    let memberRole;
    try {
        memberRole = await getMemberRole(auth.artifacts.id, params.id);
    } catch (error) {
        request.logger.warn('User is not a team member');
    }

    if (
        memberRole === ROLE_OWNER &&
        auth.artifacts.id === params.userId &&
        payload.status !== ROLE_OWNER
    ) {
        return Boom.forbidden(
            "owners can't change their own role. please transfer ownership to another user first."
        );
    }

    if (!isAdmin && !canChangeMemberStatus({ memberRole, userRole: payload.status })) {
        return Boom.unauthorized();
    }

    const userTeam = await UserTeam.findOne({
        where: {
            user_id: params.userId,
            organization_id: params.id
        }
    });

    if (payload.status === ROLE_OWNER && userTeam.invite_token === '') {
        await UserTeam.update(
            {
                team_role: ROLE_ADMIN
            },
            {
                where: {
                    team_role: ROLE_OWNER,
                    organization_id: params.id
                }
            }
        );
    }

    await userTeam.update({
        team_role: payload.status
    });

    if (payload.status === ROLE_OWNER) {
        await server.app.events.emit(server.app.event.TEAM_OWNER_CHANGED, {
            id: params.id,
            owner_id: params.userId
        });
    }

    return h.response().code(204);
}

async function addTeamMember(request, h) {
    const { auth, params, payload, server } = request;
    const isAdmin = server.methods.isAdmin(request);

    if (!isAdmin) return Boom.unauthorized();

    const teamCount = await Team.count({
        where: { id: params.id }
    });

    if (!teamCount) return Boom.notFound();

    const user = await User.findOne({
        where: { id: payload.userId },
        attributes: ['id', 'email', 'language']
    });

    if (!user) return Boom.conflict('User does not exist.');

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
        team_role: payload.role,
        invited_by: auth.artifacts.id
    };

    if (payload.role === ROLE_OWNER) {
        await UserTeam.update(
            {
                team_role: ROLE_ADMIN
            },
            {
                where: {
                    team_role: ROLE_OWNER,
                    organization_id: params.id
                }
            }
        );
    }

    // clear user plugin cache as user might have
    // access to new products now
    await clearPluginCache(user.id);

    await UserTeam.create(data);

    if (data.team_role === ROLE_OWNER) {
        await server.app.events.emit(server.app.event.TEAM_OWNER_CHANGED, {
            id: data.organization_id,
            owner_id: data.user_id
        });
    }

    return h.response().code(201);
}

/**
 * handles DELETE /v3/team/:id/members/:userId requests
 */
async function deleteTeamMember(request, h) {
    const { auth, params, server } = request;

    const isAdmin = server.methods.isAdmin(request);
    const user = auth.artifacts;

    if (!isAdmin) {
        const memberRole = await getMemberRole(user.id, params.id);

        if (memberRole === ROLE_MEMBER && user.id !== params.userId) {
            return Boom.unauthorized();
        }
    }

    const row = await UserTeam.findOne({
        where: {
            user_id: params.userId,
            organization_id: params.id
        }
    });

    const owner = await UserTeam.findOne({
        where: {
            team_role: ROLE_OWNER,
            organization_id: params.id
        }
    });

    if (!row) return Boom.notFound();

    if (row.team_role === ROLE_OWNER) {
        return Boom.unauthorized('Can not delete team owner.');
    }

    if (!owner) {
        const chartCount = await Chart.count({
            where: {
                author_id: params.userId,
                organization_id: params.id
            }
        });

        if (chartCount > 0) {
            return Boom.badRequest(
                'Cannot delete team member, since team has no owner to transfer charts to.'
            );
        }
    }

    await Chart.update(
        {
            author_id: owner.user_id
        },
        {
            where: {
                author_id: params.userId,
                organization_id: params.id
            }
        }
    );

    await row.destroy();

    await clearPluginCache(params.userId);

    return h.response().code(204);
}

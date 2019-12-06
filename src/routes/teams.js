const Joi = require('@hapi/joi');
const Boom = require('@hapi/boom');
const { Op } = require('sequelize');
const set = require('lodash/set');
const nanoid = require('nanoid');
const crypto = require('crypto');
const { decamelize, camelize } = require('humps');
const {
    Chart,
    Team,
    User,
    UserTeam,
    Folder,
    TeamProduct,
    Product,
    TeamTheme,
    UserPluginCache
} = require('@datawrapper/orm/models');
const { logAction } = require('@datawrapper/orm/utils/action');

const { createResponseConfig, noContentResponse, listResponse } = require('../schemas/response.js');

const teamResponse = createResponseConfig({
    schema: Joi.object({
        id: Joi.string(),
        name: Joi.string()
    }).unknown()
});

const ROLE_OWNER = 'owner';
const ROLE_ADMIN = 'admin';
const ROLE_MEMBER = 'member';
const ROLES = [ROLE_OWNER, ROLE_ADMIN, ROLE_MEMBER];

const routes = [
    {
        method: 'GET',
        path: '/{teamId}/products',
        params: {
            teamId: Joi.string()
                .required()
                .description('ID of the team to fetch products for.')
        },
        handler: async function getAllTeamProducts(request, h) {
            const { auth, params } = request;
            const user = auth.artifacts;

            if (!user || !user.mayAdministrateTeam(params.teamId)) {
                return Boom.unauthorized();
            }

            const team = await Team.findByPk(params.teamId, {
                attributes: ['id'],
                include: [
                    {
                        model: Product,
                        attributes: ['id', 'name']
                    }
                ]
            });

            const products = team.products.map(product => ({
                id: product.id,
                name: product.name,
                expires: product.team_product.expires
            }));

            return {
                list: products,
                total: products.length
            };
        }
    },
    {
        method: 'POST',
        path: '/{teamId}/products',
        params: {
            teamId: Joi.string()
                .required()
                .description('ID of the team to create the product for.')
        },
        payload: {
            expires: Joi.date()
                .allow(null)
                .optional(),
            productId: Joi.number()
        },
        handler: async function addTeamProduct(request, h) {
            const { server, payload, params } = request;
            server.methods.isAdmin(request, { throwError: true });

            const hasProduct = !!(await TeamProduct.findOne({
                where: {
                    organization_id: params.teamId,
                    productId: payload.productId
                }
            }));

            if (hasProduct) {
                return Boom.badRequest('This product is already associated to this team.');
            }

            const teamProduct = await TeamProduct.create({
                organization_id: params.teamId,
                productId: payload.productId,
                expires: payload.expires || null,
                created_by_admin: true
            });

            const team = await Team.findByPk(params.teamId);
            await team.invalidatePluginCache();

            return h.response(teamProduct).code(201);
        }
    },
    {
        method: 'PUT',
        path: '/{teamId}/products/{productId}',
        params: {
            teamId: Joi.string()
                .required()
                .description('ID of the team.'),
            productId: Joi.number()
                .required()
                .description('ID of the product.')
        },
        payload: {
            expires: Joi.date()
                .allow(null)
                .optional()
        },
        handler: async function updateTeamProduct(request, h) {
            const { server, payload, params } = request;
            server.methods.isAdmin(request, { throwError: true });

            const teamProduct = await TeamProduct.findOne({
                where: {
                    organization_id: params.teamId,
                    product_id: params.productId
                }
            });

            if (!teamProduct) {
                return Boom.notFound('This product is not associated to this team.');
            }

            await teamProduct.update({
                expires: payload.expires
            });

            const team = await Team.findByPk(params.teamId);
            await team.invalidatePluginCache();

            return h.response().code(204);
        }
    },
    {
        method: 'DELETE',
        path: '/{teamId}/products/{productId}',
        params: {
            teamId: Joi.string()
                .required()
                .description('ID of the team.'),
            productId: Joi.number()
                .required()
                .description('ID of the product.')
        },
        handler: async function deleteTeamProduct(request, h) {
            const { server, params } = request;
            const isAdmin = server.methods.isAdmin(request);

            if (!isAdmin) {
                return Boom.unauthorized();
            }

            const deleteCount = await TeamProduct.destroy({
                where: {
                    organization_id: params.teamId,
                    product_id: params.productId
                }
            });

            if (!deleteCount) {
                return Boom.notFound('This product is not associated to this team.');
            }

            const team = await Team.findByPk(params.teamId);
            await team.invalidatePluginCache();

            return h.response().code(204);
        }
    }
];

module.exports = {
    name: 'teams-routes',
    version: '1.0.0',
    register: (server, options) => {
        server.route({
            method: 'GET',
            path: '/',
            options: {
                tags: ['api'],
                description: 'List teams',
                notes: 'Get a list of teams you are part of.',
                validate: {
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
            handler: getAllTeams
        });

        server.route({
            method: 'GET',
            path: `/{id}`,
            options: {
                tags: ['api'],
                description: 'Fetch team information',
                validate: {
                    params: Joi.object({
                        id: Joi.string()
                            .required()
                            .description('ID of the team to fetch.')
                    })
                },
                response: teamResponse
            },
            handler: getTeam
        });

        server.route({
            method: 'GET',
            path: `/{id}/members`,
            options: {
                tags: ['api'],
                description: 'List team members',
                notes:
                    'Get a list of team members and some additional information like their team role.',
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

        server.route({
            method: 'DELETE',
            path: `/{id}`,
            options: {
                tags: ['api'],
                description: 'Delete a team',
                notes: `**Be careful!** This is a destructive action that can only be performed by team owners.`,
                validate: {
                    params: Joi.object({
                        id: Joi.string()
                            .required()
                            .description('ID of the team to delete.')
                    })
                },
                response: noContentResponse
            },
            handler: deleteTeam
        });

        server.route({
            method: 'DELETE',
            path: `/{id}/members/{userId}`,
            options: {
                tags: ['api'],
                description: 'Remove a team member',
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

        server.route({
            method: 'POST',
            path: `/`,
            options: {
                tags: ['api'],
                description: 'Create a team',
                validate: {
                    payload: Joi.object({
                        id: Joi.string()
                            .optional()
                            .example('revengers'),
                        name: Joi.string()
                            .required()
                            .example('Revengers'),
                        settings: Joi.object({
                            type: Joi.string()
                        }).optional(),
                        defaultTheme: Joi.string()
                            .example('space')
                            .optional()
                    })
                },
                response: teamResponse
            },
            handler: createTeam
        });

        server.route({
            method: 'PATCH',
            path: `/{id}`,
            options: {
                tags: ['api'],
                description: 'Update a team',
                validate: {
                    params: Joi.object({
                        id: Joi.string()
                            .required()
                            .description('Team ID')
                    }),
                    payload: Joi.object({
                        name: Joi.string().example('New Revengers'),
                        defaultTheme: Joi.string().example('light'),
                        settings: Joi.object({}).unknown(true)
                    })
                },
                response: teamResponse
            },
            handler: editTeam
        });

        server.route({
            method: 'POST',
            path: `/{id}/members`,
            options: {
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
                            .description('ID of the team member you want to change the status of.'),
                        role: Joi.string()
                            .valid(ROLES)
                            .required()
                    })
                },
                response: createResponseConfig({
                    status: { '201': Joi.any().empty() }
                })
            },
            handler: addTeamMember
        });

        server.route({
            method: 'POST',
            path: `/{id}/invites`,
            options: {
                tags: ['api'],
                description: 'Invite a person',
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
                            .example('thor@gmail.com'),
                        role: Joi.string()
                            .valid(ROLES)
                            .required()
                    }
                },
                response: createResponseConfig({
                    status: { '201': Joi.any().empty() }
                })
            },
            /**
             * handles POST /v3/teams/:id/invites
             */
            handler: inviteTeamMember
        });

        server.route({
            method: 'POST',
            path: '/{id}/invites/{token}',
            options: {
                tags: ['api'],
                description: 'Accept a team invitation',
                validate: {
                    params: {
                        id: Joi.string()
                            .required()
                            .description('Team ID (eg. guardians-of-the-galaxy)'),
                        token: Joi.string()
                            .required()
                            .description('A valid team invitation token')
                    }
                },
                response: createResponseConfig({
                    status: { '201': Joi.any().empty() }
                })
            },
            handler: acceptTeamInvitation
        });

        server.route({
            method: 'DELETE',
            path: `/{id}/invites/{token}`,
            options: {
                tags: ['api'],
                auth: false,
                description: 'Reject a team invitation',
                validate: {
                    params: {
                        id: Joi.string()
                            .required()
                            .description('Team ID (eg. guardians-of-the-galaxy)'),
                        token: Joi.string()
                            .required()
                            .description('A valid team invitation token')
                    }
                },
                response: createResponseConfig({
                    status: { '204': Joi.any().empty() }
                })
            },
            handler: rejectTeamInvitation
        });

        server.route({
            method: 'PUT',
            path: `/{id}/members/{userId}/status`,
            options: {
                tags: ['api'],
                description: 'Set team member status',
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

        routes.forEach(route => {
            server.route({
                method: route.method,
                path: route.path,
                options: {
                    validate: {
                        params: route.params,
                        query: route.query,
                        payload: route.payload
                    }
                },
                handler: route.handler
            });
        });
    }
};

async function getMemberRole(userId, teamId) {
    const userTeamRow = await UserTeam.findOne({
        where: {
            user_id: userId,
            organization_id: teamId
        }
    });

    if (!userTeamRow) {
        throw Boom.unauthorized();
    }

    return userTeamRow.team_role;
}

async function getAllTeams(request, h) {
    const res = await request.server.inject({
        method: 'GET',
        url: `/v3/admin/teams?userId=${request.auth.artifacts.id}&${request.url.search.slice(1)}`,
        auth: request.auth
    });
    return h.response(res.result).code(res.statusCode);
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
        include: [
            {
                model: User,
                attributes: ['id', 'email', 'name']
            }
        ],
        where: {
            id: params.id
        }
    };

    const team = await Team.findOne(options);

    if (!team) {
        return Boom.notFound();
    }

    const { users, settings, ...data } = team.dataValues;

    const memberRole = hasTeam ? await getMemberRole(auth.artifacts.id, params.id) : undefined;
    const owner = users.find(u => u.user_team.team_role === ROLE_OWNER);

    const res = convertKeys(
        {
            ...data,
            memberCount: users.length,
            role: memberRole,
            url: url.pathname
        },
        camelize
    );

    if (isAdmin || memberRole !== ROLE_MEMBER) {
        return {
            ...res,
            settings,
            owner: owner
                ? {
                      id: owner.id,
                      email: owner.email
                  }
                : null
        };
    }
    return res;
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
                token,
                isNewUser: token ? user.activate_token === token : undefined,
                url: `/v3/users/${user.id}`
            };
        }),
        total: count
    };
}

async function editTeam(request, h) {
    const { auth, payload, params, server } = request;

    if (!server.methods.isAdmin(request)) {
        const memberRole = await getMemberRole(auth.artifacts.id, params.id);

        if (memberRole === ROLE_MEMBER) {
            return Boom.unauthorized();
        }
    }

    let data = payload;

    let team = await Team.findByPk(params.id);

    if (!team) return Boom.notFound();

    team = await team.update(convertKeys(data, decamelize));

    data = team.dataValues;

    if (typeof data.settings === 'string') {
        data.settings = JSON.parse(data.settings);
    }

    data.updatedAt = new Date().toISOString();
    return convertKeys(data, camelize);
}

async function deleteTeam(request, h) {
    const { auth, params, server } = request;

    if (!server.methods.isAdmin(request)) {
        const memberRole = await getMemberRole(auth.artifacts.id, params.id);

        if (memberRole !== ROLE_OWNER) {
            return Boom.unauthorized();
        }
    }

    const query = {
        where: {
            organization_id: params.id
        }
    };

    await Promise.all([
        // remove all relations to this team
        UserTeam.destroy(query),
        TeamProduct.destroy(query),
        TeamTheme.destroy(query),
        // move charts back to their owners
        Chart.update(
            {
                organization_id: null,
                in_folder: null
            },
            query
        )
    ]);

    // remove team folders
    await Folder.destroy({
        where: {
            org_id: params.id
        }
    });

    const destroyedRows = await Team.destroy({
        where: {
            id: params.id
        }
    });

    /* no rows got updated, which means the team is already deleted or doesn't exist */
    if (!destroyedRows) {
        return Boom.notFound();
    }

    return h.response().code(204);
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

/**
 * handler for POST /v3/teams
 */
async function createTeam(request, h) {
    const { auth, payload, server } = request;
    const isAdmin = server.methods.isAdmin(request);

    async function unusedId(name) {
        async function isUsed(id) {
            return !!(await Team.findOne({ where: { id } }));
        }

        const normalized = isAdmin
            ? name
                  .normalize('NFD')
                  .replace(/[\u0300-\u036f]/g, '')
                  .toLowerCase()
                  .replace(/[^\w]/gi, '')
            : nanoid(8);

        if (!(await isUsed(normalized))) return normalized;

        let i = 2;
        while (await isUsed(`${normalized}-${i}`)) {
            i++;
        }
        return `${normalized}-${i}`;
    }

    try {
        const teamParams = {
            id: payload.id && isAdmin ? payload.id : await unusedId(payload.name),
            name: payload.name
        };

        if (payload.defaultTheme) teamParams.default_theme = payload.defaultTheme;
        if (payload.setting) teamParams.settings = payload.settings;

        const team = await Team.create(teamParams);

        // so let's add user to team
        await UserTeam.create({
            organization_id: team.id,
            user_id: auth.artifacts.id,
            team_role: 'owner'
        });

        return h
            .response({
                id: team.id,
                name: team.name,
                settings: team.settings,
                defaultTheme: team.default_theme,
                createdAt: team.createdAt,
                url: `/v3/teams/${team.id}`
            })
            .code(201);
    } catch (error) {
        request.logger.error(error);
        return Boom.conflict();
    }
}

function canInviteUsers({ userRole, memberRole, inviteeRole }) {
    if (userRole === 'pending') {
        // only activated users may invite users
        return false;
    }
    if (memberRole !== ROLE_ADMIN && memberRole !== ROLE_OWNER) {
        // only team admins and team owners may invite users
        return false;
    }
    if (memberRole !== ROLE_OWNER && inviteeRole === ROLE_OWNER) {
        // only a team owner may invite a new owner
        return false;
    }
    return true;
}

/**
 * handles POST /v3/teams/:id/invites
 */
async function inviteTeamMember(request, h) {
    const { auth, params, payload, server } = request;

    const isAdmin = server.methods.isAdmin(request);

    const user = auth.artifacts;

    if (!isAdmin) {
        const memberRole = await getMemberRole(user.id, params.id);

        if (
            !canInviteUsers({
                userRole: user.role,
                memberRole,
                inviteeRole: payload.role
            })
        ) {
            return Boom.unauthorized();
        }
    }

    const maxTeamInvites = isAdmin
        ? false
        : await getMaxTeamInvites({
              server,
              teamId: params.id
          });

    if (maxTeamInvites !== false) {
        const pendingInvites = await getPendingTeamInvites({ user });
        if (pendingInvites >= maxTeamInvites) {
            const error = Boom.notAcceptable(
                `You already invited ${maxTeamInvites} user into teams. You can invite more users when invitations have been accepted.`
            );
            error.output.payload.data = { maxTeamInvites };
            return error;
        }
    }

    let inviteeWasCreated = false;

    const teamCount = await Team.count({
        where: { id: params.id }
    });

    if (!teamCount) return Boom.notFound();

    let invitee = await User.findOne({
        where: { email: payload.email },
        attributes: ['id', 'email', 'language']
    });

    const token = server.methods.generateToken();

    if (!invitee) {
        const passwordToken = server.methods.generateToken();
        const hash = await request.server.methods.hashPassword(passwordToken);
        invitee = await User.create({
            email: payload.email,
            activate_token: token,
            role: 'pending',
            pwd: hash,
            name: null
        });
        inviteeWasCreated = true;
    }

    const isMember = !!(await UserTeam.findOne({
        where: {
            user_id: invitee.id,
            organization_id: params.id
        }
    }));

    if (isMember) {
        return Boom.badRequest('User is already member of team.');
    }

    const data = {
        user_id: invitee.id,
        organization_id: params.id,
        team_role: payload.role,
        invite_token: token,
        invited_by: user.id
    };

    await UserTeam.create(data);
    const team = await Team.findByPk(data.organization_id);

    const { https, domain } = server.methods.config('frontend');
    const appUrl = `${https ? 'https' : 'http'}://${domain}`;
    await server.app.events.emit(server.app.event.SEND_EMAIL, {
        type: 'team-invite',
        to: invitee.email,
        language: invitee.language,
        data: {
            team_admin: auth.artifacts.email,
            team_name: team.name,
            activation_link: inviteeWasCreated
                ? `${appUrl}/datawrapper-invite/${data.invite_token}`
                : `${appUrl}/team/${team.id}/invite/${data.invite_token}/accept`,
            rejection_link: `${appUrl}/team/${team.id}/invite/${data.invite_token}/reject`
        }
    });

    await logAction(user.id, 'team/invite', { team: params.id, invited: invitee.id });

    return h.response().code(201);
}

/**
 * handles POST /v3/teams/:id/invites/:token
 */
async function acceptTeamInvitation(request, h) {
    const { auth, params } = request;

    const user = auth.artifacts;

    const userTeam = await UserTeam.findOne({
        where: {
            user_id: user.id,
            organization_id: params.id,
            invite_token: params.token
        }
    });

    if (!userTeam) {
        return Boom.notFound();
    }

    if (userTeam.team_role === 'owner') {
        // we're invited as owner, turn former owner
        // into team admin
        await UserTeam.update(
            {
                team_role: 'admin'
            },
            {
                where: {
                    user_id: {
                        [Op.not]: user.id
                    },
                    team_role: 'owner',
                    organization_id: params.id
                }
            }
        );
    }
    await userTeam.update({
        invite_token: ''
    });

    // clear user plugin cache as user might have
    // access to new products now
    await clearPluginCache(user.id);

    logAction(userTeam.invited_by, 'team/invite/accept', params.id);

    return h.response().code(201);
}

/**
 * handles DELETE /v3/teams/:id/invites/:token
 */
async function rejectTeamInvitation(request, h) {
    const { params } = request;

    const userTeam = await UserTeam.findOne({
        where: {
            organization_id: params.id,
            invite_token: params.token
        }
    });

    if (!userTeam) {
        return Boom.notFound();
    }

    // remove invitation
    await userTeam.destroy();

    const user = await User.findByPk(userTeam.user_id);

    if (user) {
        // also remove user who never activated the account
        if (user.activate_token === params.token) {
            await user.destroy();
        }

        // and log email hash for future spam detection
        const hmac = crypto.createHash('sha256');
        hmac.update(user.email);
        logAction(userTeam.invited_by, 'team/invite/reject', hmac.digest('hex'));
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
    return h.response().code(201);
}

function canChangeMemberStatus({ memberRole, userRole }) {
    if (!memberRole) {
        return false;
    }
    if (memberRole === ROLE_MEMBER) {
        // only admins and owners may change member status
        return false;
    }
    if (memberRole !== ROLE_OWNER && userRole === ROLE_OWNER) {
        // only team owners may set a new team owner
        return false;
    }
    return true;
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

    return h.response().code(204);
}

function convertKeys(input, method) {
    const output = {};
    for (const k in input) {
        output[method(k)] = input[k];
    }
    return output;
}

async function getMaxTeamInvites({ teamId, server }) {
    const maxTeamInvitesRes = await server.app.events.emit(server.app.event.MAX_TEAM_INVITES, {
        teamId
    });
    const maxTeamInvites = maxTeamInvitesRes
        .filter(d => d.status === 'success')
        .map(({ data }) => data.maxInvites)
        .sort()
        .pop();
    return maxTeamInvites !== undefined ? maxTeamInvites : false;
}

async function getPendingTeamInvites({ user }) {
    return UserTeam.count({
        where: {
            invited_by: user.id,
            invite_token: {
                [Op.not]: ''
            }
        }
    });
}

async function clearPluginCache(userId) {
    return UserPluginCache.destroy({
        where: {
            user_id: userId
        }
    });
}

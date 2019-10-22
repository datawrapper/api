const Joi = require('@hapi/joi');
const Boom = require('@hapi/boom');
const { Op } = require('sequelize');
const set = require('lodash/set');
const { decamelize, decamelizeKeys, camelizeKeys } = require('humps');
const {
    Chart,
    Team,
    User,
    UserTeam,
    TeamProduct,
    Product,
    TeamTheme
} = require('@datawrapper/orm/models');

const ROLES = ['owner', 'admin', 'member'];

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
            path: `/{id}`,
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
            method: 'POST',
            path: `/`,
            options: {
                tags: ['api'],
                validate: {
                    payload: {
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
                        defaultTheme: Joi.string().example('light'),
                        settings: Joi.object({
                            type: Joi.string().optional(),
                            'chart-templates': Joi.boolean().optional(),
                            folders: Joi.string().optional(),
                            displayLocale: Joi.boolean().optional(),
                            restrictDefaultThemes: Joi.boolean().optional(),
                            embed: Joi.object({
                                preferred_embed: Joi.string().optional(),
                                custom_embed: Joi.object({
                                    title: Joi.string()
                                        .allow('')
                                        .optional(),
                                    text: Joi.string()
                                        .allow('')
                                        .optional(),
                                    template: Joi.string()
                                        .allow('')
                                        .optional()
                                }).optional()
                            }),
                            default: Joi.object({
                                locale: Joi.string()
                                    .allow('')
                                    .allow(null)
                                    .optional(),
                                folder: Joi.number()
                                    .allow('')
                                    .allow(null)
                                    .optional()
                            }).optional(),
                            slack_enabled: Joi.boolean().optional(),
                            slack_webhook_url: Joi.string()
                                .allow('')
                                .optional(),
                            customFields: Joi.array()
                                .items(
                                    Joi.object({
                                        title: Joi.string(),
                                        description: Joi.string().allow(''),
                                        key: Joi.string(),
                                        type: Joi.string()
                                    })
                                )
                                .optional(),
                            ftp: Joi.object({
                                enabled: Joi.boolean(),
                                server: Joi.string().allow(''),
                                user: Joi.string().allow(''),
                                password: Joi.string().allow(''),
                                directory: Joi.string().allow(''),
                                filename: Joi.string().allow('')
                            }).optional(),
                            disableVisualizations: Joi.object({
                                enabled: Joi.boolean(),
                                visualizations: Joi.object()
                                    .unknown(true)
                                    .optional(),
                                allowAdmins: Joi.boolean().optional()
                            }).optional(),
                            basemaps: Joi.array()
                                .items(Joi.object().unknown(true))
                                .optional(),
                            publishFormats: Joi.array()
                                .items(
                                    Joi.object({
                                        filename: Joi.string(),
                                        format: Joi.string().allow('png'),
                                        width: Joi.number(),
                                        height: Joi.number(),
                                        include: Joi.boolean()
                                    })
                                )
                                .optional()
                        })
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
                        userId: Joi.number()
                            .integer()
                            .required()
                            .description('ID of the team member you want to change the status of.'),
                        role: Joi.string()
                            .valid(ROLES)
                            .required()
                    }
                }
            },
            handler: addTeamMember
        });

        server.route({
            method: 'POST',
            path: `/{id}/invites`,
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
                            .example('thor@gmail.com'),
                        role: Joi.string()
                            .valid(ROLES)
                            .required()
                    }
                }
            },
            handler: inviteTeamMember
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

        routes.forEach(route => {
            server.route({
                method: route.method,
                path: route.path,
                options: {
                    tags: ['api'],
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

    if (!server.methods.isAdmin(request)) {
        const memberRole = await getMemberRole(auth.artifacts.id, params.id);

        if (memberRole === ROLES[2]) {
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
                    id: params.id,
                    deleted: {
                        [Op.not]: true
                    }
                }
            },
            { model: Chart, attributes: ['id'] }
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
                role: ROLES[user_team.dataValues.team_role],
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

    await UserTeam.destroy({
        where: {
            organization_id: params.id
        }
    });

    await TeamProduct.destroy({
        where: {
            organization_id: params.id
        }
    });

    await TeamTheme.destroy({
        where: {
            organization_id: params.id
        }
    });

    await Chart.update(
        {
            organization_id: null,
            in_folder: null
        },
        {
            where: {
                organization_id: params.id
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
    const { auth, payload, server } = request;
    const isAdmin = server.methods.isAdmin(request);

    async function unusedId(name) {
        async function isUsed(id) {
            return !!(await Team.findOne({ where: { id } }));
        }

        const normalized = name
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^\w]/gi, '');

        if (!(await isUsed(normalized))) return normalized;

        let i = 2;
        while (await isUsed(`${normalized}-${i}`)) {
            i++;
        }
        return `${normalized}-${i}`;
    }

    try {
        const teamParams = {
            id: payload.id ? payload.id : await unusedId(payload.name),
            name: payload.name
        };

        if (payload.defaultTheme) teamParams.default_theme = payload.defaultTheme;
        if (payload.setting) teamParams.settings = payload.settings;

        const team = await Team.create(teamParams);

        if (!isAdmin) {
            // not an admin, so let's add user to team
            await UserTeam.create({
                organization_id: team.id,
                user_id: auth.artifacts.id,
                team_role: 'owner'
            });
        }

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

async function inviteTeamMember(request, h) {
    const { auth, params, payload, server } = request;

    const isAdmin = server.methods.isAdmin(request);
    let userWasCreated = false;

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

    if (!user) {
        const passwordToken = server.methods.generateToken();
        const hash = await request.server.methods.hashPassword(passwordToken);
        user = await User.create({
            email: payload.email,
            activate_token: token,
            role: 'pending',
            pwd: hash,
            name: null
        });
        userWasCreated = true;
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
        team_role: payload.role,
        invite_token: token
    };

    const team = await UserTeam.create(data);

    const { https, domain } = server.methods.config('frontend');
    await server.app.events.emit(server.app.event.SEND_EMAIL, {
        type: 'team-invite',
        to: user.email,
        language: user.language,
        data: {
            team_admin: auth.artifacts.email,
            team_name: team.name,
            activation_link: `${https ? 'https' : 'http'}://${domain}/${
                userWasCreated ? 'datawrapper-invite' : 'organization-invite'
            }/${data.invite_token}`
        }
    });

    return h.response().code(201);
}

async function addTeamMember(request, h) {
    const { params, payload, server } = request;
    const isAdmin = server.methods.isAdmin(request);

    if (!isAdmin) return Boom.unauthorized();

    let teamCount = await Team.count({
        where: { id: params.id, deleted: { [Op.not]: true } }
    });

    if (!teamCount) return Boom.notFound();

    let user = await User.findOne({
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
        team_role: payload.role
    };

    await UserTeam.create(data);
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

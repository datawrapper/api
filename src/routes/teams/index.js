const Joi = require('@hapi/joi');
const Boom = require('@hapi/boom');
const nanoid = require('nanoid');
const { Team, UserTeam } = require('@datawrapper/orm/models');

const { listResponse, teamResponse } = require('../../schemas/response.js');

module.exports = {
    name: 'routes/teams',
    version: '1.0.0',
    register: (server, options) => {
        server.app.scopes.add('team:read');
        server.app.scopes.add('team:write');
        // GET /v3/teams
        server.route({
            method: 'GET',
            path: '/',
            options: {
                tags: ['api'],
                description: 'List teams',
                notes: 'Get a list of teams you are part of.',
                auth: {
                    access: { scope: ['team:read'] }
                },
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

        // POST /v3/teams
        server.route({
            method: 'POST',
            path: `/`,
            options: {
                tags: ['api'],
                description: 'Create a team',
                auth: {
                    access: { scope: ['team:write'] }
                },
                validate: {
                    payload: Joi.object({
                        id: Joi.string().optional().example('revengers'),
                        name: Joi.string().required().example('Revengers'),
                        settings: Joi.object({
                            type: Joi.string()
                        }).optional(),
                        defaultTheme: Joi.string().example('space').optional()
                    })
                },
                response: teamResponse
            },
            handler: createTeam
        });

        server.register(require('./{id}'), {
            routes: {
                prefix: '/{id}'
            }
        });
    }
};

async function getAllTeams(request, h) {
    const res = await request.server.inject({
        method: 'GET',
        url: `/v3/admin/teams?userId=${request.auth.artifacts.id}&${request.url.search.slice(1)}`,
        auth: request.auth
    });
    return h.response(res.result).code(res.statusCode);
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

        await server.app.events.emit(server.app.event.TEAM_CREATED, {
            id: team.id,
            owner_id: auth.artifacts.id
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

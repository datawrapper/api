const Joi = require('@hapi/joi');
const Boom = require('@hapi/boom');
const { decamelize, camelize } = require('humps');
const {
    Chart,
    Team,
    User,
    UserTeam,
    Folder,
    TeamProduct,
    TeamTheme
} = require('@datawrapper/orm/models');

const { noContentResponse, teamResponse } = require('../../../schemas/response.js');

const { ROLE_MEMBER, ROLE_OWNER, convertKeys, getMemberRole } = require('../utils');

module.exports = {
    name: 'routes/teams/{id}',
    version: '1.0.0',
    register(server, options) {
        // GET /v3/teams/{id}
        server.route({
            method: 'GET',
            path: `/`,
            options: {
                tags: ['api'],
                description: 'Fetch team information',
                notes: `Requires scope \`team:read\` or \`team:write\`.`,
                auth: {
                    access: { scope: ['team:read', 'team:write'] }
                },
                validate: {
                    params: Joi.object({
                        id: Joi.string().required().description('ID of the team to fetch.')
                    })
                },
                response: teamResponse
            },
            handler: getTeam
        });

        // DELETE /v3/teams/{id}
        server.route({
            method: 'DELETE',
            path: `/`,
            options: {
                tags: ['api'],
                description: 'Delete a team',
                notes: `**Be careful!** This is a destructive action that can only be performed by team owners. Requires scope \`team:write\`.`,
                auth: {
                    access: { scope: ['team:write'] }
                },
                validate: {
                    params: Joi.object({
                        id: Joi.string().required().description('ID of the team to delete.')
                    })
                },
                response: noContentResponse
            },
            handler: deleteTeam
        });

        // PATCH /v3/teams/{id}
        server.route({
            method: 'PATCH',
            path: `/`,
            options: {
                tags: ['api'],
                description: 'Update a team',
                notes: `Requires scope \`team:write\`.`,
                auth: {
                    access: { scope: ['team:write'] }
                },
                validate: {
                    params: Joi.object({
                        id: Joi.string().required().description('Team ID')
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

        require('./invites')(server, options);
        require('./members')(server, options);
        require('./products')(server, options);
    }
};

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

async function editTeam(request, h) {
    const { auth, payload, params, server } = request;

    if (!server.methods.isAdmin(request)) {
        const memberRole = await getMemberRole(auth.artifacts.id, params.id);

        if (memberRole === ROLE_MEMBER) {
            return Boom.unauthorized();
        }
    }

    let data = {
        name: payload.name,
        settings: payload.settings,
        disabled: payload.disabled,
        defaultTheme: payload.defaultTheme
    };

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

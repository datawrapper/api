const Joi = require('@hapi/joi');
const { Op } = require('@datawrapper/orm').db;
const set = require('lodash/set');
const { camelizeKeys, decamelize } = require('humps');
const { Team, User } = require('@datawrapper/orm/models');

module.exports = {
    name: 'admin-teams-routes',
    version: '1.0.0',
    register
};

function register(server, options) {
    server.route({
        method: 'GET',
        path: '/',
        options: {
            auth: 'admin',
            validate: {
                query: {
                    userId: Joi.number(),
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
                }
            }
        },
        handler: getAllTeams
    });

    async function getAllTeamsByUser(request, h) {
        const { query } = request;
        const isAdmin = server.methods.isAdmin(request);
        const user = await User.findOne({
            where: {
                id: query.userId
            },
            include: [
                {
                    model: Team,
                    include: [User]
                }
            ]
        });
        return {
            list: user.teams.map(({ dataValues }) => {
                const { user_team, settings, users, ...data } = dataValues;
                const owner = users.find(user => user.user_team.team_role === 'owner');
                const team = camelizeKeys({
                    ...data,
                    memberCount: users.length,
                    role: user_team.team_role,
                    url: `/v3/teams/${dataValues.id}`
                });
                if (user_team.team_role !== 'member' || isAdmin) {
                    return {
                        ...team,
                        settings,
                        owner: owner
                            ? {
                                  id: owner.id,
                                  url: `/v3/users/${owner.id}`,
                                  email: owner.email
                              }
                            : null
                    };
                }
                return team;
            }),
            total: user.teams.length
        };
    }

    async function getAllTeams(request, h) {
        const { query, url } = request;
        if (query.userId) return getAllTeamsByUser(request, h);

        const options = {
            order: [[decamelize(query.orderBy), query.order]],
            include: [
                {
                    model: User,
                    attributes: ['id', 'email']
                }
            ],
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

        const { rows, count } = await Team.findAndCountAll(options);

        const teamList = {
            list: rows.map(({ dataValues }) => {
                const { users, ...data } = dataValues;
                const owner = users.find(user => user.user_team.team_role === 'owner');
                return camelizeKeys({
                    ...data,
                    memberCount: users.length,
                    owner: owner
                        ? {
                              id: owner.id,
                              url: `/v3/users/${owner.id}`,
                              email: owner.email
                          }
                        : null,
                    url: `/v3/teams/${dataValues.id}`
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

            set(teamList, 'next', `${url.pathname}?${nextParams.toString()}`);
        }

        return teamList;
    }
}

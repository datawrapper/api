const Joi = require('@hapi/joi');
const { Op } = require('sequelize');
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

    async function getAllTeams(request, h) {
        const { query, url } = request;

        const options = {
            order: [[decamelize(query.orderBy), query.order]],
            attributes: {
                exclude: ['deleted']
            },
            include: [
                {
                    model: User,
                    attributes: ['id'],
                    where: query.userId ? { id: query.userId } : undefined
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
                return camelizeKeys({
                    ...data,
                    memberCount: users.length,
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

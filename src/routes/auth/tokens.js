const Joi = require('@hapi/joi');
const Boom = require('@hapi/boom');
const {
    listResponse,
    noContentResponse,
    createResponseConfig
} = require('../../schemas/response.js');
const { camelizeKeys } = require('humps');
const { AuthToken } = require('@datawrapper/orm/models');
const set = require('lodash/set');

module.exports = async (server, options) => {
    // GET /v3/auth/tokens
    server.route({
        method: 'GET',
        path: '/tokens',
        options: {
            tags: ['api'],
            description: 'List API tokens',
            notes: 'Response will not include full tokens for security reasons.',
            validate: {
                query: Joi.object({
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
        handler: getAllTokens
    });

    // POST /v3/auth/tokens
    server.route({
        method: 'POST',
        path: '/tokens',
        options: {
            tags: ['api'],
            description: 'Create API token',
            notes: `This endpoint will create a new API Token and show it in the response body.
                     It is possible to create a comment with every token to have a reference where it is used.
                     Make sure to save the token somewhere, since you won't be able to see it again.`,
            validate: {
                payload: Joi.object({
                    comment: Joi.string()
                        .required()
                        .example('Token for fun project')
                        .description(
                            'The comment can be everything. Tip: Use something to remember where this specific token is used.'
                        )
                })
            },
            response: createResponseConfig({
                schema: Joi.object({
                    id: Joi.number().integer(),
                    comment: Joi.string(),
                    token: Joi.string(),
                    createdAt: Joi.date()
                }).unknown()
            })
        },
        handler: createToken
    });

    // DELETE /v3/auth/tokens/{id}
    server.route({
        method: 'DELETE',
        path: '/tokens/{id}',
        options: {
            tags: ['api'],
            description: 'Delete API token',
            notes:
                'Delete an API access token. Check [/v3/auth/tokens](ref:authtokens) to get the IDs of your available tokens.',
            validate: {
                params: Joi.object({
                    id: Joi.number()
                        .integer()
                        .required()
                        .description('ID of the token to be deleted.')
                })
            },
            response: noContentResponse
        },
        handler: deleteToken
    });
};

async function getAllTokens(request, h) {
    const { query, auth, url } = request;

    if (auth.artifacts.role === 'guest') {
        return Boom.unauthorized();
    }

    const options = {
        attributes: ['id', 'token', 'last_used_at', 'comment'],
        where: {
            user_id: auth.artifacts.id
        },
        limit: query.limit,
        offset: query.offset
    };

    const { count, rows } = await AuthToken.findAndCountAll(options);

    const tokenList = {
        list: rows.map(({ dataValues }) => {
            const { token, ...data } = dataValues;
            return camelizeKeys({
                ...data,
                lastTokenCharacters: token.slice(-4),
                url: `${url.pathname}/${data.id}`
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

        set(tokenList, 'next', `${url.pathname}?${nextParams.toString()}`);
    }

    return tokenList;
}

async function createToken(request, h) {
    if (request.auth.artifacts.role === 'guest') {
        return Boom.unauthorized();
    }

    const token = await AuthToken.newToken({
        user_id: request.auth.artifacts.id,
        comment: request.payload.comment
    });

    const { user_id, ...data } = token.dataValues;

    return camelizeKeys(data);
}

async function deleteToken(request, h) {
    if (request.auth.artifacts.role === 'guest') {
        return Boom.unauthorized();
    }

    const token = await AuthToken.findByPk(request.params.id, {
        where: { user_id: request.auth.artifacts.id }
    });

    if (!token) {
        return Boom.notFound();
    }

    await token.destroy();
    return h.response().code(204);
}

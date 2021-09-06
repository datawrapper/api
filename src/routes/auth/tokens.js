const Joi = require('joi');
const Boom = require('@hapi/boom');
const {
    listResponse,
    noContentResponse,
    createResponseConfig
} = require('../../schemas/response.js');
const { camelizeKeys } = require('humps');
const { AccessToken } = require('@datawrapper/orm/models');
const set = require('lodash/set');

module.exports = async (server, options) => {
    // GET /v3/auth/tokens
    server.route({
        method: 'GET',
        path: '/tokens',
        options: {
            tags: ['api'],
            auth: {
                access: { scope: ['auth:read'] }
            },
            description: 'List API tokens',
            notes: 'Response will not include full tokens for security reasons. Requires scope `auth:read`.',
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
                     Make sure to save the token somewhere, since you won't be able to see it again.  Requires scope \`auth:write\`.`,
            auth: {
                access: { scope: ['auth:write'] }
            },
            validate: {
                payload: tokenPayload()
            },
            response: createResponseConfig({
                schema: Joi.object({
                    id: Joi.number().integer(),
                    comment: Joi.string(),
                    scopes: Joi.array().items(Joi.string()),
                    token: Joi.string(),
                    createdAt: Joi.date(),
                    url: Joi.string()
                }).unknown()
            })
        },
        async handler(request, h) {
            const { payload, auth, url } = request;
            if (!auth.artifacts.isActivated()) {
                // only activated users may create api tokens
                return Boom.unauthorized('You need to activate your account first');
            }

            if (payload.scopes) {
                validateScopes(payload.scopes, auth.credentials.scope);
            } else {
                payload.scopes = auth.credentials.scope;
            }

            const token = await AccessToken.newToken({
                type: 'api-token',
                user_id: auth.artifacts.id,
                data: {
                    comment: payload.comment,
                    scopes: payload.scopes
                }
            });

            return h
                .response({
                    id: token.id,
                    token: token.token,
                    createdAt: token.createdAt,
                    comment: token.data.comment,
                    scopes: token.data.scopes,
                    url: `${url.pathname}/${token.id}`
                })
                .code(201);
        }
    });

    // PUT /v3/auth/tokens/{id}
    server.route({
        method: 'PUT',
        path: '/tokens/{id}',
        options: {
            tags: ['api'],
            description: 'Edit API token',
            notes: 'Edit an API access token. Check [/v3/auth/tokens](ref:authtokens) to get the IDs of your available tokens.  Requires scope `auth:write`.',
            auth: {
                access: { scope: ['auth:write'] }
            },
            validate: {
                payload: tokenPayload(),
                params: Joi.object({
                    id: Joi.number()
                        .integer()
                        .required()
                        .description('ID of the token to be edited.')
                })
            },
            response: noContentResponse
        },
        async handler(request, h) {
            const { params, auth, payload } = request;
            if (!auth.artifacts.isActivated()) {
                // only activated users may edit api tokens
                return Boom.unauthorized('You need to activate your account first');
            }
            const token = await AccessToken.findOne({
                where: {
                    type: 'api-token',
                    user_id: auth.artifacts.id,
                    id: params.id
                }
            });
            if (!token) return Boom.notFound();
            const data = {
                comment: payload.comment
            };
            if (payload.scopes) {
                validateScopes(payload.scopes, auth.credentials.scope);
                data.scopes = payload.scopes;
            } else {
                data.scopes = auth.credentials.scope;
            }
            await token.update({ data });
            return h.response().code(204);
        }
    });

    // DELETE /v3/auth/tokens/{id}
    server.route({
        method: 'DELETE',
        path: '/tokens/{id}',
        options: {
            tags: ['api'],
            description: 'Delete API token',
            notes: 'Delete (=revoke) an API access token. Check [/v3/auth/tokens](ref:authtokens) to get the IDs of your available tokens.  Requires scope `auth:write`.',
            auth: {
                access: { scope: ['auth:write'] }
            },
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
        async handler(request, h) {
            const { params, auth } = request;
            const token = await AccessToken.destroy({
                where: {
                    type: 'api-token',
                    user_id: auth.artifacts.id,
                    id: params.id
                },
                limit: 1
            });
            if (!token) return Boom.notFound();
            return h.response().code(204);
        }
    });

    // GET /v3/auth/token-scopes
    server.route({
        method: 'GET',
        path: '/token-scopes',
        options: {
            tags: ['api'],
            description: 'Get list of valid token scopes.  Requires scope `auth:read`.',
            auth: {
                access: { scope: ['auth:read'] }
            }
        },
        async handler(request, h) {
            const scopes = Array.from(server.app.scopes);
            if (!request.server.methods.isAdmin(request)) return scopes;
            const adminScopes = Array.from(server.app.adminScopes);
            return [...scopes, ...adminScopes];
        }
    });

    function tokenPayload() {
        return Joi.object({
            comment: Joi.string()
                .required()
                .example('Token for fun project')
                .description(
                    'The comment can be everything. Tip: Use something to remember where this specific token is used.'
                ),
            scopes: Joi.array().items(
                Joi.string()
                    .regex(/^[a-z-:]+$/)
                    .description('scopes to be granted for this token')
            )
        });
    }

    function validateScopes(scopes, sessionScopes) {
        for (let i = 0; i < scopes.length; i++) {
            const scope = scopes[i];
            if (!server.app.scopes.has(scope) && !server.app.adminScopes.has(scope)) {
                throw Boom.badRequest(`Invalid scope "${scope}"`);
            }
            if (!sessionScopes.includes(scope)) {
                throw Boom.unauthorized(
                    `You are not authorized to create tokens with the scope "${scope}"`
                );
            }
        }
    }
};

async function getAllTokens(request, h) {
    const { query, auth, url } = request;

    const options = {
        where: {
            type: 'api-token',
            user_id: auth.artifacts.id
        },
        limit: query.limit,
        offset: query.offset
    };

    const { count, rows } = await AccessToken.findAndCountAll(options);

    const tokenList = {
        list: rows.map(({ token, id, createdAt, last_used_at, data: { comment, scopes } }) => {
            return camelizeKeys({
                id,
                createdAt,
                last_used_at,
                comment,
                scopes,
                firstTokenCharacters: token.slice(0, 4),
                lastTokenCharacters: token.slice(-4),
                url: `${url.pathname}/${id}`
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

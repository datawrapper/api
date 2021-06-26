const test = require('ava');
const { createUser, destroy, setup } = require('../../../test/helpers/setup');

test.before(async t => {
    t.context.server = await setup({ usePlugins: false });
});

test('Tokens can be created, fetched and deleted', async t => {
    let userObj;
    try {
        userObj = await createUser(t.context.server);
        const { user, session } = userObj;

        const auth = {
            strategy: 'session',
            credentials: { session, scope: ['auth:read', 'auth:write'] },
            artifacts: user
        };
        const headers = {
            cookie: 'crumb=abc',
            'X-CSRF-Token': 'abc',
            referer: 'http://localhost'
        };

        let res = await t.context.server.inject({
            method: 'POST',
            url: '/v3/auth/tokens',
            payload: { comment: 'Test Token' },
            auth,
            headers
        });
        const tokenId = res.result.id;

        t.is(res.statusCode, 201);
        t.is(res.result.comment, 'Test Token');
        // by default new api token scopes are limited to the
        // session scopes
        t.deepEqual(res.result.scopes, ['auth:read', 'auth:write']);
        t.truthy(res.result);

        res = await t.context.server.inject({
            method: 'GET',
            url: '/v3/auth/tokens',
            auth
        });

        t.true(Array.isArray(res.result.list));
        t.is(res.result.list.length, res.result.total);

        res = await t.context.server.inject({
            method: 'DELETE',
            url: `/v3/auth/tokens/${tokenId}`,
            auth,
            headers
        });

        t.is(res.statusCode, 204);
    } finally {
        if (userObj) {
            await destroy(...Object.values(userObj));
        }
    }
});

test('The scope of newly created tokens cannot exceed the session scopes', async t => {
    const { AccessToken } = require('@datawrapper/orm/models');
    let userObj;
    const tokenIds = [];
    try {
        userObj = await createUser(t.context.server);
        const { user, session } = userObj;

        const auth = {
            strategy: 'session',
            credentials: {
                session,
                scope: ['auth:read', 'chart:read', 'auth:write']
            },
            artifacts: user
        };
        const headers = {
            cookie: 'crumb=abc',
            'X-CSRF-Token': 'abc',
            referer: 'http://localhost'
        };

        let res = await t.context.server.inject({
            method: 'POST',
            url: '/v3/auth/tokens',
            payload: {
                comment: 'Test Token',
                scopes: ['chart:read']
            },
            auth,
            headers
        });
        tokenIds.push(res.result.id);
        t.is(res.statusCode, 201);
        t.deepEqual(res.result.scopes, ['chart:read']);

        res = await t.context.server.inject({
            method: 'POST',
            url: '/v3/auth/tokens',
            payload: {
                comment: 'Test Token'
            },
            auth,
            headers
        });
        tokenIds.push(res.result.id);
        t.is(res.statusCode, 201);
        t.deepEqual(res.result.scopes, ['auth:read', 'chart:read', 'auth:write']);

        res = await t.context.server.inject({
            method: 'POST',
            url: '/v3/auth/tokens',
            payload: {
                comment: 'Test Token',
                scopes: ['chart:write']
            },
            auth,
            headers
        });

        t.is(res.statusCode, 401);
    } finally {
        if (userObj) {
            await destroy(...Object.values(userObj));
        }
        for (const tokenId of tokenIds) {
            const token = await AccessToken.findByPk(tokenId);
            await destroy(token);
        }
    }
});

test('Tokens cannot be created when the user is not activated', async t => {
    let userObj;
    try {
        userObj = await createUser(t.context.server, 'pending');
        const { user, session } = userObj;

        const auth = {
            strategy: 'session',
            credentials: { session, scope: ['auth:read', 'auth:write'] },
            artifacts: user
        };
        const headers = {
            cookie: 'crumb=abc',
            'X-CSRF-Token': 'abc',
            referer: 'http://localhost'
        };

        let res = await t.context.server.inject({
            method: 'POST',
            url: '/v3/auth/tokens',
            payload: { comment: 'Test Token' },
            auth,
            headers
        });

        t.is(user.isActivated(), false);
        t.is(res.statusCode, 401);

        user.role = 'editor';
        await user.save();

        res = await t.context.server.inject({
            method: 'POST',
            url: '/v3/auth/tokens',
            payload: { comment: 'Test Token' },
            auth,
            headers
        });

        t.is(user.isActivated(), true);
        t.is(res.statusCode, 201);
    } finally {
        if (userObj) {
            await destroy(...Object.values(userObj));
        }
    }
});

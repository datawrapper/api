const test = require('ava');

const { setup } = require('../../../test/helpers/setup');

test.before(async t => {
    const { server, models, getUser, getCredentials, addToCleanup, getTeamWithUser } = await setup({
        usePlugins: false
    });

    t.context.server = server;

    const { user, session, token } = await getUser();
    t.context.user = user;
    t.context.session = session.id;
    t.context.token = token;
    t.context.models = models;
    t.context.getUser = getUser;
    t.context.getTeamWithUser = getTeamWithUser;
    t.context.getCredentials = getCredentials;
    t.context.addToCleanup = addToCleanup;
});

test('Tokens can be created, fetched and deleted', async t => {
    const { User } = t.context.models;
    const auth = {
        strategy: 'session',
        credentials: { session: t.context.session, scope: ['auth:read', 'auth:write'] },
        artifacts: User.build({ id: t.context.user.id })
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
});

test('The scope of newly created tokens cannot exceed the session scopes', async t => {
    const { User, AccessToken } = t.context.models;
    const auth = {
        strategy: 'session',
        credentials: {
            session: t.context.session,
            scope: ['auth:read', 'chart:read', 'auth:write']
        },
        artifacts: User.build({ id: t.context.user.id })
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

    const cleanup = [res.result.id];
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

    t.is(res.statusCode, 201);
    cleanup.push(res.result.id);
    t.deepEqual(res.result.scopes, ['auth:read', 'chart:read', 'auth:write']);

    // cleanup tokens
    await AccessToken.destroy({
        where: {
            id: cleanup
        }
    });

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
});

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

    let res = await t.context.server.inject({
        method: 'POST',
        url: '/v3/auth/tokens',
        payload: { comment: 'Test Token' },
        auth
    });

    const tokenId = res.result.id;
    t.is(res.result.comment, 'Test Token');
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
        auth
    });

    t.is(res.statusCode, 204);
});

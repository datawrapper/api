const test = require('ava');

const { setup } = require('../../../test/helpers/setup');

test.before(async t => {
    const { server, models, getUser, addToCleanup } = await setup({ usePlugins: false });
    const data = await getUser();

    t.context.server = server;
    t.context.addToCleanup = addToCleanup;
    t.context.models = models;
    t.context.auth = {
        strategy: 'session',
        credentials: data.session,
        artifacts: data.user
    };
});

test('Login token can be created and used once', async t => {
    const { auth } = t.context;

    const res = await t.context.server.inject({
        method: 'POST',
        url: '/v3/auth/login-tokens',
        auth
    });

    t.is(res.statusCode, 201);
    t.is(typeof res.result.token, 'string');

    const res2 = await t.context.server.inject({
        method: 'GET',
        url: `/v3/auth/login/${res.result.token}`
    });

    t.truthy(res2.result['DW-SESSION']);
    t.is(res2.statusCode, 302);

    const res3 = await t.context.server.inject({
        method: 'GET',
        url: `/v3/auth/login/${res.result.token}`
    });

    t.is(res3.statusCode, 404);
});

test('Login token can be created and deleted', async t => {
    const { auth } = t.context;

    const res = await t.context.server.inject({
        method: 'POST',
        url: '/v3/auth/login-tokens',
        auth
    });

    t.is(res.statusCode, 201);
    t.is(typeof res.result.token, 'string');

    const res2 = await t.context.server.inject({
        method: 'DELETE',
        url: `/v3/auth/login-tokens/${res.result.id}`,
        auth
    });

    t.is(res2.statusCode, 204);

    const res3 = await t.context.server.inject({
        method: 'GET',
        url: `/v3/auth/login/${res.result.token}`
    });

    t.is(res3.statusCode, 404);
});

test('Login token can be created and retrieved', async t => {
    const { auth } = t.context;

    const res = await t.context.server.inject({
        method: 'POST',
        url: '/v3/auth/login-tokens',
        auth
    });

    t.is(res.statusCode, 201);
    t.is(typeof res.result.token, 'string');

    const res2 = await t.context.server.inject({
        method: 'GET',
        url: `/v3/auth/login-tokens`,
        auth
    });

    t.is(res2.statusCode, 200);
    t.truthy(res2.result.total > 0);
    t.is(res2.result.list[0].lastTokenCharacters.length, 4);

    await t.context.server.inject({
        method: 'DELETE',
        url: `/v3/auth/login-tokens/${res.result.id}`,
        auth
    });
});

test('Login token with chart ID can be created and forwards correctly', async t => {
    const { auth } = t.context;

    const chart = await t.context.server.inject({
        method: 'POST',
        url: '/v3/charts',
        headers: {
            cookie: `DW-SESSION=${auth.credentials.id}`
        },
        payload: {}
    });

    const res = await t.context.server.inject({
        method: 'POST',
        url: '/v3/auth/login-tokens',
        auth,
        payload: {
            chartId: chart.result.id,
            step: 'preview'
        }
    });

    t.is(res.statusCode, 201);
    t.is(typeof res.result.token, 'string');

    const res2 = await t.context.server.inject({
        method: 'GET',
        url: `/v3/auth/login/${res.result.token}`,
        auth
    });

    t.truthy(res2.result['DW-SESSION']);
    t.is(res2.statusCode, 302);
    t.is(res2.headers.location.indexOf(`/chart/${chart.result.id}/preview`) > -1, true);
});

test('Login token expires after five minutes', async t => {
    const { auth, models } = t.context;
    const { AccessToken } = models;

    const res = await t.context.server.inject({
        method: 'POST',
        url: '/v3/auth/login-tokens',
        auth
    });

    t.is(res.statusCode, 201);
    t.is(typeof res.result.token, 'string');

    await AccessToken.update(
        {
            createdAt: new Date().getTime() - 6 * 60 * 1000 // 6m ago
        },
        {
            where: {
                token: res.result.token
            }
        }
    );

    const res2 = await t.context.server.inject({
        method: 'GET',
        url: `/v3/auth/login/${res.result.token}`
    });

    t.is(res2.statusCode, 404);

    await AccessToken.destroy({ where: { token: res.result.token } });
});

test('Login token with chart ID that user cannot edit cannot be created', async t => {
    const { auth } = t.context;

    const res = await t.context.server.inject({
        method: 'POST',
        url: '/v3/auth/login-tokens',
        auth,
        payload: {
            chartId: 'notmy'
        }
    });

    t.is(res.statusCode, 404);
});

test('Token with invalid chart ID cannot be created', async t => {
    const { auth } = t.context;

    const res = await t.context.server.inject({
        method: 'POST',
        url: '/v3/auth/login-tokens',
        auth,
        payload: {
            chartId: `'"); DROP TABLE users;`
        }
    });

    t.is(res.statusCode, 400);
});

test('Token with invalid edit step cannot be created', async t => {
    const { auth } = t.context;

    const res = await t.context.server.inject({
        method: 'POST',
        url: '/v3/auth/login-tokens',
        auth,
        payload: {
            chartId: 'abcde',
            step: `'"); DROP TABLE charts;`
        }
    });

    t.is(res.statusCode, 400);
});

test('Invalid login token returns 404', async t => {
    const res = await t.context.server.inject({
        method: 'GET',
        url: `/v3/auth/login-tokens/thisisafaketoken`
    });

    t.is(res.statusCode, 404);
});

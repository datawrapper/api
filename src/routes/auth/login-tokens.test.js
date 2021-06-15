const test = require('ava');
const { createUser, destroy, setup } = require('../../../test/helpers/setup');

function parseSetCookie(string) {
    const cookie = {};
    string
        .split(';')
        .map(str => str.trim().split('='))
        .forEach(value => {
            cookie[value[0]] = value[1] || true;
        });
    return cookie;
}

test.before(async t => {
    t.context.server = await setup({ usePlugins: false });
    t.context.userObj = await createUser(t.context.server);
    t.context.auth = {
        strategy: 'session',
        credentials: t.context.userObj.session,
        artifacts: t.context.userObj.user
    };
    t.context.headers = {
        cookie: 'crumb=abc',
        'X-CSRF-Token': 'abc',
        referer: 'http://localhost'
    };
});

test.after.always(async t => {
    await destroy(...Object.values(t.context.userObj));
});

test('Login token can be created and used once', async t => {
    const { auth, headers } = t.context;

    const res = await t.context.server.inject({
        method: 'POST',
        url: '/v3/auth/login-tokens',
        auth,
        headers
    });

    t.is(res.statusCode, 201);
    t.is(typeof res.result.token, 'string');

    const res2 = await t.context.server.inject({
        method: 'GET',
        url: `/v3/auth/login/${res.result.token}`
    });

    const cookie = parseSetCookie(res2.headers['set-cookie'].find(s => s.includes(`DW-SESSION`)));

    t.truthy(res2.result['DW-SESSION']);
    t.is(res2.statusCode, 302);
    t.is(cookie.SameSite, 'None');

    const res3 = await t.context.server.inject({
        method: 'GET',
        url: `/v3/auth/login/${res.result.token}`
    });

    t.is(res3.statusCode, 404);
});

test('Login token can be created and deleted', async t => {
    const { auth, headers } = t.context;

    const res = await t.context.server.inject({
        method: 'POST',
        url: '/v3/auth/login-tokens',
        auth,
        headers
    });

    t.is(res.statusCode, 201);
    t.is(typeof res.result.token, 'string');

    const res2 = await t.context.server.inject({
        method: 'DELETE',
        url: `/v3/auth/login-tokens/${res.result.id}`,
        auth,
        headers
    });

    t.is(res2.statusCode, 204);

    const res3 = await t.context.server.inject({
        method: 'GET',
        url: `/v3/auth/login/${res.result.token}`
    });

    t.is(res3.statusCode, 404);
});

test('Login token can be created and retrieved', async t => {
    const { auth, headers } = t.context;

    const res = await t.context.server.inject({
        method: 'POST',
        url: '/v3/auth/login-tokens',
        auth,
        headers
    });

    t.is(res.statusCode, 201);
    t.is(typeof res.result.token, 'string');

    const res2 = await t.context.server.inject({
        method: 'GET',
        url: `/v3/auth/login-tokens`,
        auth,
        headers
    });

    t.is(res2.statusCode, 200);
    t.truthy(res2.result.total > 0);
    t.is(res2.result.list[0].lastTokenCharacters.length, 4);

    await t.context.server.inject({
        method: 'DELETE',
        url: `/v3/auth/login-tokens/${res.result.id}`,
        auth,
        headers
    });
});

test('Login token with chart ID can be created and forwards correctly', async t => {
    const { auth, headers } = t.context;

    const chart = await t.context.server.inject({
        method: 'POST',
        url: '/v3/charts',
        headers: {
            cookie: `DW-SESSION=${auth.credentials.id}; crumb=abc`,
            'X-CSRF-Token': 'abc',
            referer: 'http://localhost'
        },
        payload: {}
    });

    const res = await t.context.server.inject({
        method: 'POST',
        url: '/v3/auth/login-tokens',
        auth,
        headers,
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
        auth,
        headers
    });

    t.truthy(res2.result['DW-SESSION']);
    t.is(res2.statusCode, 302);
    t.is(res2.headers.location.indexOf(`/chart/${chart.result.id}/preview`) > -1, true);
});

test('Login token expires after five minutes', async t => {
    const { auth, headers } = t.context;

    const res = await t.context.server.inject({
        method: 'POST',
        url: '/v3/auth/login-tokens',
        auth,
        headers
    });

    t.is(res.statusCode, 201);
    t.is(typeof res.result.token, 'string');

    const { AccessToken } = require('@datawrapper/orm/models');
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
    const { auth, headers } = t.context;

    const res = await t.context.server.inject({
        method: 'POST',
        url: '/v3/auth/login-tokens',
        auth,
        headers,
        payload: {
            chartId: 'notmy'
        }
    });

    t.is(res.statusCode, 404);
});

test('Token with invalid chart ID cannot be created', async t => {
    const { auth, headers } = t.context;

    const res = await t.context.server.inject({
        method: 'POST',
        url: '/v3/auth/login-tokens',
        auth,
        headers,
        payload: {
            chartId: `'"); DROP TABLE users;`
        }
    });

    t.is(res.statusCode, 400);
});

test('Token with invalid edit step cannot be created', async t => {
    const { auth, headers } = t.context;

    const res = await t.context.server.inject({
        method: 'POST',
        url: '/v3/auth/login-tokens',
        auth,
        headers,
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

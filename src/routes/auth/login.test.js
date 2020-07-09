const test = require('ava');

const { setup } = require('../../../test/helpers/setup');

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

test('Login and logout work with correct credentials', async t => {
    let res = await t.context.server.inject({
        method: 'POST',
        url: '/v3/auth/login',
        payload: {
            email: t.context.user.email,
            password: 'test-password'
        }
    });

    t.truthy(res.result['DW-SESSION']);
    t.is(res.statusCode, 200);

    const session = res.result['DW-SESSION'];
    res = await t.context.server.inject({
        method: 'POST',
        url: '/v3/auth/logout',
        headers: {
            cookie: `DW-SESSION=${session}`
        }
    });

    t.is(res.statusCode, 205);
    t.true(res.headers['set-cookie'][0].includes('DW-SESSION=;'));
    t.false(res.headers['set-cookie'].includes(session));
});

test('Login fails with incorrect credentials', async t => {
    const res = await t.context.server.inject({
        method: 'POST',
        url: '/v3/auth/login',
        payload: {
            email: t.context.user.email,
            password: 'hunter2'
        }
    });

    t.is(res.statusCode, 401);
});

test("Login set's correct cookie", async t => {
    let res = await t.context.server.inject({
        method: 'POST',
        url: '/v3/auth/login',
        payload: {
            email: t.context.user.email,
            password: 'test-password'
        }
    });

    let cookie = parseSetCookie(res.headers['set-cookie'][0]);
    t.log('session', cookie['DW-SESSION']);
    await t.context.addToCleanup('session', cookie['DW-SESSION']);
    let maxAge = cookie['Max-Age'] / 24 / 60 / 60; // convert to seconds

    t.true(cookie.HttpOnly);
    t.is(maxAge, 90);
    t.is(cookie.SameSite, 'Strict');

    res = await t.context.server.inject({
        method: 'POST',
        url: '/v3/auth/login',
        payload: {
            email: t.context.user.email,
            password: 'test-password',
            keepSession: false
        }
    });

    cookie = parseSetCookie(res.headers['set-cookie'][0]);
    t.log('session', cookie['DW-SESSION']);
    await t.context.addToCleanup('session', cookie['DW-SESSION']);
    maxAge = cookie['Max-Age'] / 24 / 60 / 60; // convert to seconds

    t.is(maxAge, 30);
});

test('Logout errors with invalid session', async t => {
    const res = await t.context.server.inject({
        method: 'POST',
        url: '/v3/auth/logout',
        headers: {
            cookie: `DW-SESSION=Loki`
        }
    });

    t.is(res.statusCode, 401);
    t.is(res.result.message, 'Session not found');
});

test('Logout errors with token', async t => {
    const res = await t.context.server.inject({
        method: 'POST',
        url: '/v3/auth/logout',
        headers: {
            authorization: `Bearer ${t.context.token}`
        }
    });

    t.is(res.statusCode, 401);
    t.is(res.result.message, 'Session not found');
});

test('Guest charts are associated after login', async t => {
    /* Get guest session */
    let res = await t.context.server.inject({
        method: 'POST',
        url: '/v3/auth/session'
    });

    t.is(res.statusCode, 200);
    const session = res.result['DW-SESSION'];

    /* Create chart as guest */
    res = await t.context.server.inject({
        method: 'POST',
        url: '/v3/charts',
        headers: {
            cookie: `DW-SESSION=${session}`
        },
        payload: {
            title: 'Test guest chart'
        }
    });

    const chartId = res.result.id;
    t.log('Chart ID:', chartId);
    t.is(res.result.title, 'Test guest chart');
    t.is(res.result.authorId, null);

    const { user } = await t.context.getUser();

    res = await t.context.server.inject({
        method: 'POST',
        url: '/v3/auth/login',
        headers: {
            cookie: `DW-SESSION=${session}`
        },
        payload: {
            email: user.email,
            password: 'test-password'
        }
    });

    const charts = await t.context.models.Chart.findAll({
        where: {
            author_id: user.id
        }
    });

    t.is(charts.length, 1);
    t.is(charts[0].id, chartId);
});

test('Login and logout updates session fields', async t => {
    const { Session } = t.context.models;
    let res = await t.context.server.inject({
        method: 'POST',
        url: '/v3/auth/login',
        payload: {
            email: t.context.user.email,
            password: 'test-password',
            keepSession: false
        }
    });

    const sessionId = res.result['DW-SESSION'];

    // check Session
    const session = await Session.findByPk(sessionId);
    t.is(session.user_id, t.context.user.id);
    t.is(session.persistent, false);

    // now logout
    res = await t.context.server.inject({
        method: 'POST',
        url: '/v3/auth/logout',
        headers: {
            cookie: `DW-SESSION=${sessionId}`
        }
    });

    // check that session has been destroyed
    const session2 = await Session.findByPk(sessionId);
    t.is(session2, null);
});

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
    t.context.user = t.context.userObj.user;
    t.context.session = t.context.userObj.session.id;
    t.context.token = t.context.userObj.token;
});

test.after.always(async t => {
    await destroy(...Object.values(t.context.userObj));
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
            cookie: `DW-SESSION=${session}; crumb=abc`,
            'X-CSRF-Token': 'abc',
            referer: 'http://localhost'
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
    let sessionId;
    try {
        let res = await t.context.server.inject({
            method: 'POST',
            url: '/v3/auth/login',
            payload: {
                email: t.context.user.email,
                password: 'test-password'
            }
        });

        let cookie = parseSetCookie(res.headers['set-cookie'].find(s => s.includes(`DW-SESSION`)));
        t.log('session', cookie['DW-SESSION']);
        sessionId = cookie['DW-SESSION'];
        let maxAge = cookie['Max-Age'] / 24 / 60 / 60; // convert to seconds

        t.true(cookie.HttpOnly);
        t.is(maxAge, 90);
        t.is(cookie.SameSite, 'Lax');

        res = await t.context.server.inject({
            method: 'POST',
            url: '/v3/auth/login',
            payload: {
                email: t.context.user.email,
                password: 'test-password',
                keepSession: false
            }
        });

        cookie = parseSetCookie(res.headers['set-cookie'].find(s => s.includes(`DW-SESSION`)));
        t.log('session', cookie['DW-SESSION']);
        maxAge = cookie['Max-Age'] / 24 / 60 / 60; // convert to seconds

        t.is(maxAge, 30);
    } finally {
        if (sessionId) {
            const { Session } = require('@datawrapper/orm/models');
            const session = await Session.findByPk(sessionId);
            await destroy(session);
        }
    }
});

test('Logout errors with invalid session', async t => {
    const res = await t.context.server.inject({
        method: 'POST',
        url: '/v3/auth/logout',
        headers: {
            cookie: 'DW-SESSION=Loki; crumb=abc',
            'X-CSRF-Token': 'abc',
            referer: 'http://localhost'
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
    const { Chart } = require('@datawrapper/orm/models');

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
            cookie: `DW-SESSION=${session}; crumb=abc`,
            'X-CSRF-Token': 'abc',
            referer: 'http://localhost'
        },
        payload: {
            title: 'Test guest chart'
        }
    });

    const chartId = res.result.id;
    t.log('Chart ID:', chartId);
    t.is(res.result.title, 'Test guest chart');
    t.is(res.result.authorId, null);

    let userObj;
    try {
        userObj = await createUser(t.context.server);
        const { user } = userObj;

        res = await t.context.server.inject({
            method: 'POST',
            url: '/v3/auth/login',
            headers: {
                cookie: `DW-SESSION=${session}; crumb=abc`,
                'X-CSRF-Token': 'abc',
                referer: 'http://localhost'
            },
            payload: {
                email: user.email,
                password: 'test-password'
            }
        });

        const charts = await Chart.findAll({
            where: {
                author_id: user.id
            }
        });

        t.is(charts.length, 1);
        t.is(charts[0].id, chartId);
    } finally {
        if (userObj) {
            await destroy(...Object.values(userObj));
        }
    }
});

test('Login and logout updates session fields', async t => {
    const { Session } = require('@datawrapper/orm/models');
    let session;
    try {
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
        session = await Session.findByPk(sessionId);
        t.is(session.user_id, t.context.user.id);
        t.is(session.persistent, false);

        // now logout
        res = await t.context.server.inject({
            method: 'POST',
            url: '/v3/auth/logout',
            headers: {
                cookie: `DW-SESSION=${sessionId}; crumb=abc`,
                'X-CSRF-Token': 'abc',
                referer: 'http://localhost'
            }
        });

        // check that session has been destroyed
        const session2 = await Session.findByPk(sessionId);
        t.is(session2, null);
    } finally {
        await destroy(session);
    }
});

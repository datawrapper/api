const test = require('ava');

const { setup } = require('../test/helpers/setup');

test.before(async t => {
    const { server, getUser } = await setup({ usePlugins: false });

    t.context.user = await getUser();
    t.context.server = server;
});

test('Request is accepted when Referer header matches frontend origin', async t => {
    const { user, session } = await t.context.user;

    const res = await t.context.server.inject({
        method: 'DELETE',
        url: `/v3/me`,
        headers: {
            cookie: `DW-SESSION=${session.id}; crumb=abc`,
            'X-CSRF-Token': 'abc',
            referer: 'http://localhost'
        },
        payload: {
            email: user.email,
            password: 'test-password'
        }
    });

    t.is(res.statusCode, 204);
});

test("Request is rejected when Referer doesn't match frontend origin", async t => {
    const { user, session } = await t.context.user;

    const res = await t.context.server.inject({
        method: 'DELETE',
        url: `/v3/me`,
        headers: {
            cookie: `DW-SESSION=${session.id}; crumb=abc`,
            'X-CSRF-Token': 'abc',
            referer: 'http://spam'
        },
        payload: {
            email: user.email,
            password: 'test-password'
        }
    });

    t.is(res.statusCode, 401);
});

test("Request is rejected when Referer header HTTP scheme doesn't match frontend origin", async t => {
    const { user, session } = await t.context.user;

    const res = await t.context.server.inject({
        method: 'DELETE',
        url: `/v3/me`,
        headers: {
            cookie: `DW-SESSION=${session.id}; crumb=abc`,
            'X-CSRF-Token': 'abc',
            referer: 'https://localhost'
        },
        payload: {
            email: user.email,
            password: 'test-password'
        }
    });

    t.is(res.statusCode, 401);
});

test('Request is rejected when Referer header is malformed', async t => {
    const { user, session } = await t.context.user;

    const res = await t.context.server.inject({
        method: 'DELETE',
        url: `/v3/me`,
        headers: {
            cookie: `DW-SESSION=${session.id}; crumb=abc`,
            'X-CSRF-Token': 'abc',
            referer: 'spam'
        },
        payload: {
            email: user.email,
            password: 'test-password'
        }
    });

    t.is(res.statusCode, 401);
});

test('Request is rejected when Referer header is empty', async t => {
    const { user, session } = await t.context.user;

    const res = await t.context.server.inject({
        method: 'DELETE',
        url: `/v3/me`,
        headers: {
            cookie: `DW-SESSION=${session.id}; crumb=abc`,
            'X-CSRF-Token': 'abc',
            referer: ''
        },
        payload: {
            email: user.email,
            password: 'test-password'
        }
    });

    t.is(res.statusCode, 401);
});

test('Referer is not checked for safe HTTP methods', async t => {
    const { session } = await t.context.user;

    const res = await t.context.server.inject({
        method: 'GET',
        url: `/v3/me`,
        headers: {
            cookie: `DW-SESSION=${session.id}`,
            referer: 'spam'
        }
    });

    t.is(res.statusCode, 200);
});

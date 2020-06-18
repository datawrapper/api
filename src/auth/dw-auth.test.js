const test = require('ava');

const { setup } = require('../../test/helpers/setup');

test.before(async t => {
    const { server, getUser } = await setup({ usePlugins: false });

    t.context.user = await getUser();
    t.context.server = server;
});

test('Should accept valid token', async t => {
    const { user, token } = t.context.user;
    const res = await t.context.server.inject({
        method: 'GET',
        url: '/v3/me',
        headers: {
            authorization: `Bearer ${token}`
        }
    });

    const { auth } = res.request;

    t.true(auth.isAuthenticated);
    t.is(auth.credentials.token, token);
    t.is(auth.artifacts.id, user.id);
});

test('Should reject invalid token', async t => {
    const res = await t.context.server.inject({
        method: 'GET',
        url: '/v3/me',
        headers: {
            authorization: 'Bearer Strange'
        }
    });

    const { auth } = res.request;

    t.false(auth.isAuthenticated);
    t.falsy(auth.credentials);
    t.falsy(auth.artifacts);
});

test('Should accept valid session cookie', async t => {
    const { user, session } = t.context.user;
    const res = await t.context.server.inject({
        method: 'GET',
        url: '/v3/me',
        headers: {
            cookie: `DW-SESSION=${session.id}`
        }
    });

    const { auth } = res.request;

    t.true(auth.isAuthenticated);
    t.is(auth.credentials.session, session.id);
    t.truthy(auth.credentials.data);
    t.is(auth.artifacts.id, user.id);
});

test('Should reject invalid session cookie', async t => {
    const res = await t.context.server.inject({
        method: 'GET',
        url: '/v3/me',
        headers: {
            cookie: 'DW-SESSION=Chewie'
        }
    });

    const { auth } = res.request;

    t.false(auth.isAuthenticated);
    t.falsy(auth.credentials);
    t.falsy(auth.artifacts);
});

test('Invalid token is ignored when session cookie is valid', async t => {
    const { session } = t.context.user;
    const res = await t.context.server.inject({
        method: 'GET',
        url: '/v3/me',
        headers: {
            authorization: 'Bearer Strange',
            cookie: `DW-SESSION=${session.id}`
        }
    });

    t.true(res.request.auth.isAuthenticated);
    t.truthy(res.request.auth.credentials.session);
});

test('Invalid session cookie is ignored when token is valid', async t => {
    const { token } = t.context.user;
    const res = await t.context.server.inject({
        method: 'GET',
        url: '/v3/me',
        headers: {
            authorization: `Bearer ${token}`,
            cookie: 'DW-SESSION=Chewie'
        }
    });

    t.true(res.request.auth.isAuthenticated);
    t.truthy(res.request.auth.credentials.token);
});

test('Should return proper response when auth failed', async t => {
    const res = await t.context.server.inject({
        method: 'GET',
        url: '/v3/me'
    });

    t.truthy(
        res.headers['www-authenticate'],
        `Server must generate www-authenticate header on failed auth
https://httpstatuses.com/401`
    );
    t.is(res.headers['www-authenticate'], 'Session, Token');
    t.is(res.statusCode, 401, 'Status code should be 401 - Unauthorized');
});

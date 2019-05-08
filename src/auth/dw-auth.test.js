import test from 'ava';

import { init } from '../server';

test.before(async t => {
    t.context.server = await init({ usePlugins: false });
});

test('Should accept valid token', async t => {
    const res = await t.context.server.inject({
        method: 'GET',
        url: '/v3/me',
        headers: {
            authorization: 'Bearer Agamotto'
        }
    });

    const { auth } = res.request;

    t.true(auth.isAuthenticated);
    t.deepEqual(auth.credentials, { token: 'Agamotto' });
    t.is(auth.artifacts.id, 1);
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
    const res = await t.context.server.inject({
        method: 'GET',
        url: '/v3/me',
        headers: {
            cookie: 'DW-SESSION=Danvers'
        }
    });

    const { auth } = res.request;

    t.true(auth.isAuthenticated);
    t.is(auth.credentials.session, 'Danvers');
    t.truthy(auth.credentials.data);
    t.is(auth.artifacts.id, 1);
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
    const res = await t.context.server.inject({
        method: 'GET',
        url: '/v3/me',
        headers: {
            authorization: 'Bearer Strange',
            cookie: 'DW-SESSION=Danvers'
        }
    });

    t.true(res.request.auth.isAuthenticated);
    t.truthy(res.request.auth.credentials.session);
});

test('Invalid session cookie is ignored when token is valid', async t => {
    const res = await t.context.server.inject({
        method: 'GET',
        url: '/v3/me',
        headers: {
            authorization: 'Bearer Agamotto',
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

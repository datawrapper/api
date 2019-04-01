import test from 'ava';
import { Op } from 'sequelize';

import { init } from '../server';

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
    t.context.server = await init({ usePlugins: false });

    const { User, Session } = require('@datawrapper/orm/models');
    t.context.SessionModel = Session;
    t.context.user = await User.create({
        email: 'tony@starkindustries.com',
        pwd: '$2b$15$4JVS.411j1fajKA9tspDaO0.orKzh8KbCWPPUkM92S2spXv01zPOa',
        role: 'editor'
    });
});

test.after.always(async t => {
    const { id } = t.context.user;
    await t.context.user.destroy();

    const deletedSessions = await t.context.SessionModel.destroy({
        where: {
            data: {
                [Op.like]: `dw-user-id|i:${id}%`
            }
        }
    });

    t.log('Sessions cleaned up:', deletedSessions);
});

test('Login and logout work with correct credentials', async t => {
    let res = await t.context.server.inject({
        method: 'POST',
        url: '/v3/auth/login',
        payload: {
            email: t.context.user.email,
            password: 'f.r.i.d.a.y'
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
    t.is(res.headers['clear-site-data'], '"cookies", "storage", "executionContexts"');
    t.true(res.headers['set-cookie'][0].includes('DW-SESSION=;'));
    t.false(res.headers['set-cookie'].includes(session));
});

test('Login fails with incorrect credentials', async t => {
    let res = await t.context.server.inject({
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
            password: 'f.r.i.d.a.y'
        }
    });

    let cookie = parseSetCookie(res.headers['set-cookie'][0]);
    let maxAge = cookie['Max-Age'] / 24 / 60 / 60; // convert to seconds

    t.true(cookie['HttpOnly']);
    t.is(cookie['SameSite'], 'Strict');
    t.is(maxAge, 90);

    res = await t.context.server.inject({
        method: 'POST',
        url: '/v3/auth/login',
        payload: {
            email: t.context.user.email,
            password: 'f.r.i.d.a.y',
            keepSession: false
        }
    });

    cookie = parseSetCookie(res.headers['set-cookie'][0]);
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
            authorization: `Bearer Agamotto`
        }
    });

    t.is(res.statusCode, 401);
    t.is(res.result.message, 'Session not found');
});

test('Tokens can be created, fetched and deleted', async t => {
    const auth = {
        strategy: 'session',
        credentials: { session: 'Danvers' },
        artifacts: { id: 1 }
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

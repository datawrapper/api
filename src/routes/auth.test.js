import test from 'ava';

import { init } from '../server';

test.before(async t => {
    t.context.server = await init({ usePlugins: false });
});

test('POST v3/auth/login exists', async t => {
    const res = await t.context.server.inject({ method: 'POST', url: '/v3/auth/login' });
    t.is(res.statusCode, 400);
    t.is(res.result.error, 'Bad Request');
});

test('POST v3/auth/logout exists', async t => {
    const res = await t.context.server.inject({ method: 'POST', url: '/v3/auth/logout' });
    t.is(res.statusCode, 401);
    t.is(res.result.error, 'Unauthorized');
});

const test = require('ava');

const { setup } = require('../../../test/helpers/setup');

test.before(async t => {
    const { server, getUser } = await setup({
        usePlugins: false
    });

    t.context.server = server;
    t.context.getUser = getUser;
});

test('User can set and unset data herself', async t => {
    const { session } = await t.context.getUser();

    const res1 = await t.context.server.inject({
        method: 'PATCH',
        url: '/v3/me/data',
        headers: {
            cookie: `DW-SESSION=${session.id}; crumb=abc`,
            'X-CSRF-Token': 'abc',
            referer: 'http://localhost'
        },
        payload: {
            foo: 'bar'
        }
    });

    t.is(res1.statusCode, 200);

    const res2 = await t.context.server.inject({
        method: 'PATCH',
        url: '/v3/me/data',
        headers: {
            cookie: `DW-SESSION=${session.id}; crumb=abc`,
            'X-CSRF-Token': 'abc',
            referer: 'http://localhost'
        },
        payload: {
            foo: null
        }
    });

    t.is(res2.statusCode, 200);
});

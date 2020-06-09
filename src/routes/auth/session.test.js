const test = require('ava');

const { setup } = require('../../../test/helpers/setup');

test.before(async t => {
    const { server } = await setup({
        usePlugins: false
    });

    t.context.server = server;
});

test('Can create guest sessions', async t => {
    let res = await t.context.server.inject({
        method: 'POST',
        url: '/v3/auth/session'
    });

    const sessionToken = res.result['DW-SESSION'];

    t.truthy(res.result['DW-SESSION']);
    t.true(res.headers['set-cookie'][0].includes(`DW-SESSION=${sessionToken}`));

    res = await t.context.server.inject({
        method: 'POST',
        url: '/v3/auth/session',
        headers: {
            cookie: `DW-SESSION=${sessionToken}`
        }
    });

    t.is(sessionToken, res.result['DW-SESSION']);

    await t.context.server.inject({
        method: 'POST',
        url: '/v3/auth/logout',
        headers: {
            cookie: `DW-SESSION=${sessionToken}`
        }
    });
});

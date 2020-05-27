const test = require('ava');

test('User can set and unset data herself', async t => {
    const { session } = await t.context.getTeamWithUser();

    const res1 = await t.context.server.inject({
        method: 'PATCH',
        url: '/v3/me/data',
        headers: {
            cookie: `DW-SESSION=${session.id}`
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
            cookie: `DW-SESSION=${session.id}`
        },
        payload: {
            foo: null
        }
    });

    t.is(res2.statusCode, 200);
});

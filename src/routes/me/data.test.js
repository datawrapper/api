const test = require('ava');
const { createUser, destroy, setup } = require('../../../test/helpers/setup');

test.before(async t => {
    t.context.server = await setup({ usePlugins: false });
});

test('User can set and unset data herself', async t => {
    let userObj;
    try {
        userObj = await createUser(t.context.server);
        const { session } = userObj;

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
    } finally {
        if (userObj) {
            await destroy(...Object.values(userObj));
        }
    }
});

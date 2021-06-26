const test = require('ava');
const { createUser, destroy, setup } = require('../../../../test/helpers/setup');

test.before(async t => {
    t.context.server = await setup({ usePlugins: false });
    t.context.userObj = await createUser(t.context.server);
    t.context.adminObj = await createUser(t.context.server, 'admin');
});

test.after.always(async t => {
    await destroy(...Object.values(t.context.userObj), ...Object.values(t.context.adminObj));
});

test('/v3/users/:id/setup creates token, token can later be emptied', async t => {
    let { user } = t.context.userObj;
    const { session: adminSession } = t.context.adminObj;
    let res = await t.context.server.inject({
        method: 'POST',
        url: `/v3/users/${user.id}/setup`,
        headers: {
            cookie: `DW-SESSION=${adminSession.id}; crumb=abc`,
            'X-CSRF-Token': 'abc',
            referer: 'http://localhost'
        }
    });

    user = await user.reload();
    t.is(res.result.token, user.dataValues.activate_token);
    t.is(user.dataValues.pwd, '');

    res = await t.context.server.inject({
        method: 'PATCH',
        url: `/v3/users/${user.id}`,
        headers: {
            cookie: `DW-SESSION=${adminSession.id}; crumb=abc`,
            'X-CSRF-Token': 'abc',
            referer: 'http://localhost'
        },
        payload: {
            activateToken: null
        }
    });

    user = await user.reload();
    t.is(null, user.dataValues.activate_token);
});

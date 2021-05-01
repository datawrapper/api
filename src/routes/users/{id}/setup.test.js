const test = require('ava');

const { setup } = require('../../../../test/helpers/setup');

test.before(async t => {
    const { server, models, getUser, getTeamWithUser, getCredentials, addToCleanup } = await setup({
        usePlugins: false
    });
    t.context.server = server;

    t.context.user = await getUser();
    t.context.admin = await getUser('admin');
    t.context.models = models;

    t.context.getUser = getUser;
    t.context.getTeamWithUser = getTeamWithUser;
    t.context.getCredentials = getCredentials;
    t.context.addToCleanup = addToCleanup;
});

test('/v3/users/:id/setup creates token, token can later be emptied', async t => {
    let [admin, { user }] = await Promise.all([t.context.getUser('admin'), t.context.getUser()]);

    let res = await t.context.server.inject({
        method: 'POST',
        url: `/v3/users/${user.id}/setup`,
        headers: {
            cookie: `DW-SESSION=${admin.session.id}; crumb=abc`,
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
            cookie: `DW-SESSION=${admin.session.id}; crumb=abc`,
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

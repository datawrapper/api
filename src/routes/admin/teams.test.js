const test = require('ava');
const { createTeamWithUser, createUser, destroy, setup } = require('../../../test/helpers/setup');

test.before(async t => {
    t.context.server = await setup({ usePlugins: false });
    t.context.teamObj = await createTeamWithUser(t.context.server);
    t.context.adminObj = await createUser(t.context.server, 'admin');
    t.context.sessionAdmin = t.context.adminObj.session.id;
    t.context.sessionUser = t.context.teamObj.session.id;
});

test.after.always(async t => {
    await destroy(...Object.values(t.context.teamObj), ...Object.values(t.context.adminObj));
});

test('admin can fetch full team list', async t => {
    const teams = await t.context.server.inject({
        method: 'GET',
        url: '/v3/admin/teams',
        headers: { cookie: `DW-SESSION=${t.context.sessionAdmin}` }
    });

    t.is(teams.statusCode, 200);
});

test('user can not fetch full team list', async t => {
    const teams = await t.context.server.inject({
        method: 'GET',
        url: '/v3/admin/teams',
        headers: { cookie: `DW-SESSION=${t.context.sessionUser}` }
    });

    t.is(teams.statusCode, 401);
    t.is(teams.result.message, 'ADMIN_ROLE_REQUIRED');
});

const test = require('ava');
const { setup } = require('../../../test/helpers/setup');

test.before(async t => {
    const { server, getTeamWithUser, getUser } = await setup({
        usePlugins: false
    });
    const [data, admin] = await Promise.all([getTeamWithUser(), getUser('admin')]);

    t.context.server = server;
    t.context.sessionAdmin = admin.session.id;
    t.context.sessionUser = data.session.id;
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

const test = require('ava');

const { setup } = require('../../../../test/helpers/setup');

test.before(async t => {
    const { server, getTeamWithUser, getUser } = await setup({
        usePlugins: false
    });

    t.context.admin = await getUser('admin');
    t.context.server = server;
    t.context.getTeamWithUser = getTeamWithUser;
});

test('Admin can set activeTeam for users', async t => {
    const admin = t.context.admin;
    const { team, user } = await t.context.getTeamWithUser();

    const res1 = await t.context.server.inject({
        method: 'PATCH',
        url: `/v3/users/${user.id}/settings`,
        headers: {
            cookie: `DW-SESSION=${admin.session.id}`
        },
        payload: {
            activeTeam: team.id
        }
    });

    t.is(res1.statusCode, 200);
    t.is(res1.result.activeTeam, team.id);

    const res2 = await t.context.server.inject({
        method: 'PATCH',
        url: `/v3/users/${user.id}/settings`,
        headers: {
            cookie: `DW-SESSION=${admin.session.id}`
        },
        payload: {
            activeTeam: null
        }
    });

    t.is(res2.statusCode, 200);
    t.is(res2.result.activeTeam, null);

    const res3 = await t.context.server.inject({
        method: 'PATCH',
        url: `/v3/users/${user.id}/settings`,
        headers: {
            cookie: `DW-SESSION=${admin.session.id}`
        },
        payload: {
            activeTeam: 'missing-team'
        }
    });

    t.is(res3.statusCode, 404);
});

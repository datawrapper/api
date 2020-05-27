const test = require('ava');

const { setup } = require('../../test/helpers/setup');

test.before(async t => {
    const { server, getTeamWithUser } = await setup({
        usePlugins: false
    });

    t.context.server = server;
    t.context.getTeamWithUser = getTeamWithUser;
});

test('User can set and unset activeTeam herself', async t => {
    const { team, session } = await t.context.getTeamWithUser();

    const res1 = await t.context.server.inject({
        method: 'PATCH',
        url: '/v3/me/settings',
        headers: {
            cookie: `DW-SESSION=${session.id}`
        },
        payload: {
            activeTeam: team.id
        }
    });

    t.is(res1.statusCode, 200);
    t.is(res1.result.activeTeam, team.id);

    const res2 = await t.context.server.inject({
        method: 'PATCH',
        url: '/v3/me/settings',
        headers: {
            cookie: `DW-SESSION=${session.id}`
        },
        payload: {
            activeTeam: null
        }
    });

    t.is(res2.statusCode, 200);
    t.is(res2.result.activeTeam, null);
});

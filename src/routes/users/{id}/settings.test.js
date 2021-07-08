const test = require('ava');
const {
    createTeamWithUser,
    createUser,
    destroy,
    setup
} = require('../../../../test/helpers/setup');

test.before(async t => {
    t.context.server = await setup({ usePlugins: false });
    t.context.adminObj = await createUser(t.context.server, 'admin');
});

test.after.always(async t => {
    await destroy(...Object.values(t.context.adminObj));
});

test('Admin can set activeTeam for users', async t => {
    const { session: adminSession } = t.context.adminObj;
    let teamObj;
    try {
        teamObj = await createTeamWithUser(t.context.server);
        const { team, user } = teamObj;

        const res1 = await t.context.server.inject({
            method: 'PATCH',
            url: `/v3/users/${user.id}/settings`,
            headers: {
                cookie: `DW-SESSION=${adminSession.id}; crumb=abc`,
                'X-CSRF-Token': 'abc',
                referer: 'http://localhost'
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
                cookie: `DW-SESSION=${adminSession.id}; crumb=abc`,
                'X-CSRF-Token': 'abc',
                referer: 'http://localhost'
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
                cookie: `DW-SESSION=${adminSession.id}; crumb=abc`,
                'X-CSRF-Token': 'abc',
                referer: 'http://localhost'
            },
            payload: {
                activeTeam: 'missing-team'
            }
        });

        t.is(res3.statusCode, 404);
    } finally {
        if (teamObj) {
            await destroy(...Object.values(teamObj));
        }
    }
});

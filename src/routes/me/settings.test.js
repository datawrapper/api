const test = require('ava');
const { createTeamWithUser, destroy, setup } = require('../../../test/helpers/setup');

test.before(async t => {
    t.context.server = await setup({ usePlugins: false });
});

test('User can set and unset activeTeam herself', async t => {
    let teamObj;
    try {
        teamObj = await createTeamWithUser(t.context.server);
        const { team, session } = teamObj;

        const res1 = await t.context.server.inject({
            method: 'PATCH',
            url: '/v3/me/settings',
            headers: {
                cookie: `DW-SESSION=${session.id}; crumb=abc`,
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
            url: '/v3/me/settings',
            headers: {
                cookie: `DW-SESSION=${session.id}; crumb=abc`,
                'X-CSRF-Token': 'abc',
                referer: 'http://localhost'
            },
            payload: {
                activeTeam: null
            }
        });

        t.is(res2.statusCode, 200);
        t.is(res2.result.activeTeam, null);
    } finally {
        if (teamObj) {
            await destroy(...Object.values(teamObj));
        }
    }
});

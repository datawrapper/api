const test = require('ava');
const {
    createTeamWithUser,
    createUser,
    destroy,
    getCredentials,
    setup
} = require('../../../test/helpers/setup');

test.before(async t => {
    t.context.server = await setup({ usePlugins: false });
    t.context.userObj = await createUser(t.context.server);
    t.context.user = t.context.userObj.user;
    t.context.session = t.context.userObj.session;
    t.context.token = t.context.userObj.token;
});

test.after.always(async t => {
    await destroy(...Object.values(t.context.userObj));
});

test('user activation after team invite', async t => {
    const { User } = require('@datawrapper/orm/models');
    let teamObj;
    let invitee;
    try {
        // create a team with user who is team owner
        teamObj = await createTeamWithUser(t.context.server);
        const { team, session: ownerSession } = teamObj;
        // get credentials for new user
        const credentials = getCredentials();
        // invite a new user to this team
        let res = await t.context.server.inject({
            method: 'POST',
            url: `/v3/teams/${team.id}/invites`,
            headers: {
                cookie: `DW-SESSION=${ownerSession.id}; crumb=abc`,
                'X-CSRF-Token': 'abc',
                referer: 'http://localhost'
            },
            payload: {
                email: credentials.email,
                role: 'member'
            }
        });
        t.is(res.statusCode, 201);

        invitee = await User.findOne({ where: { email: credentials.email } });

        // get guest session
        res = await t.context.server.inject({
            method: 'POST',
            url: '/v3/auth/session'
        });

        t.is(res.statusCode, 200);
        const guestSession = res.result['DW-SESSION'];

        // activate new user using guest session
        res = await t.context.server.inject({
            method: 'POST',
            url: `/v3/auth/activate/${invitee.activate_token}`,
            headers: {
                cookie: `DW-SESSION=${guestSession}; crumb=abc`,
                'X-CSRF-Token': 'abc',
                referer: 'http://localhost'
            }
        });
        t.is(res.statusCode, 204);

        // check if user is logged in now
        res = await t.context.server.inject({
            method: 'GET',
            url: `/v3/me`,
            headers: {
                cookie: `DW-SESSION=${guestSession}`
            }
        });

        t.is(res.statusCode, 200);
        t.is(res.result.email, credentials.email);
    } finally {
        if (teamObj) {
            await destroy(...Object.values(teamObj));
        }
        await destroy(invitee);
    }
});

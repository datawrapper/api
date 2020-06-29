const test = require('ava');

const { setup } = require('../../../test/helpers/setup');

test.before(async t => {
    const { server, models, getUser, getCredentials, addToCleanup, getTeamWithUser } = await setup({
        usePlugins: false
    });

    t.context.server = server;

    const { user, session, token } = await getUser();
    t.context.user = user;
    t.context.session = session.id;
    t.context.token = token;
    t.context.models = models;
    t.context.getTeamWithUser = getTeamWithUser;
    t.context.getCredentials = getCredentials;
    t.context.addToCleanup = addToCleanup;
});

test('user activation after team invite', async t => {
    const { addToCleanup, getTeamWithUser, getCredentials } = t.context;
    // create a team with user who is team owner
    const { team, session: ownerSession } = await getTeamWithUser();
    // get credentials for new user
    const credentials = getCredentials();
    // invite a new user to this team
    let res = await t.context.server.inject({
        method: 'POST',
        url: `/v3/teams/${team.id}/invites`,
        headers: {
            cookie: `DW-SESSION=${ownerSession.id}`
        },
        payload: {
            email: credentials.email,
            role: 'member'
        }
    });
    t.is(res.statusCode, 201);

    const { User } = t.context.models;
    const invitee = await User.findOne({ where: { email: credentials.email } });
    await addToCleanup('user', invitee.id);

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
            cookie: `DW-SESSION=${guestSession}`
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
});

const test = require('ava');
const { setup } = require('../../../../test/helpers/setup');

test.before(async t => {
    const { server, getTeamWithUser, getUser, models, addToCleanup } = await setup({
        usePlugins: false
    });
    const data = await getTeamWithUser();

    t.context.models = models;
    t.context.addToCleanup = addToCleanup;
    t.context.getTeamWithUser = getTeamWithUser;
    t.context.getUser = getUser;
    t.context.server = server;
    t.context.data = data;
    t.context.auth = {
        strategy: 'session',
        credentials: data.session,
        artifacts: data.user
    };
});

test('owners can invite new members to a team', async t => {
    const data = await t.context.getUser();
    const team = await t.context.server.inject({
        method: 'POST',
        url: `/v3/teams/${t.context.data.team.id}/invites`,
        auth: t.context.auth,
        payload: {
            email: data.user.email,
            role: 'member'
        }
    });

    t.is(team.statusCode, 201);
});

test('owners can invite new users to a team', async t => {
    const team = await t.context.server.inject({
        method: 'POST',
        url: `/v3/teams/${t.context.data.team.id}/invites`,
        auth: t.context.auth,
        payload: {
            email: 'test-member@ava.de',
            role: 'member'
        }
    });
    t.is(team.statusCode, 201);

    const user = await t.context.models.User.findOne({
        where: {
            email: 'test-member@ava.de'
        }
    });

    /* clean up the user that got created with the POST request */
    await t.context.models.UserTeam.destroy({ where: { user_id: user.id } });
    t.log('Removed user from team', user.email);
    await user.destroy();
    t.log('Removed user', user.email);

    t.is(user.email, 'test-member@ava.de');
    t.truthy(user.activate_token);
    t.is(team.statusCode, 201);
});

const test = require('ava');
const {
    createTeamWithUser,
    createUser,
    destroy,
    setup
} = require('../../../../test/helpers/setup');

test.before(async t => {
    t.context.server = await setup({ usePlugins: false });
    t.context.teamObj = await createTeamWithUser(t.context.server);
    t.context.auth = {
        strategy: 'session',
        credentials: t.context.teamObj.session,
        artifacts: t.context.teamObj.user
    };
    t.context.headers = {
        cookie: 'crumb=abc',
        'X-CSRF-Token': 'abc',
        referer: 'http://localhost'
    };
});

test.after.always(async t => {
    await destroy(...Object.values(t.context.teamObj));
});

test('owners can invite new members to a team', async t => {
    let userObj;
    try {
        userObj = await createUser(t.context.server);
        const team = await t.context.server.inject({
            method: 'POST',
            url: `/v3/teams/${t.context.teamObj.team.id}/invites`,
            auth: t.context.auth,
            headers: t.context.headers,
            payload: {
                email: userObj.user.email,
                role: 'member'
            }
        });

        t.is(team.statusCode, 201);
    } finally {
        if (userObj) {
            await destroy(...Object.values(userObj));
        }
    }
});

test('owners can invite new users to a team', async t => {
    let user;
    try {
        const { User } = require('@datawrapper/orm/models');
        const team = await t.context.server.inject({
            method: 'POST',
            url: `/v3/teams/${t.context.teamObj.team.id}/invites`,
            auth: t.context.auth,
            headers: t.context.headers,
            payload: {
                email: 'test-member@ava.de',
                role: 'member'
            }
        });

        t.is(team.statusCode, 201);

        user = await User.findOne({
            where: {
                email: 'test-member@ava.de'
            }
        });

        t.is(user.email, 'test-member@ava.de');
        t.truthy(user.activate_token);
        t.is(team.statusCode, 201);
    } finally {
        await destroy(user);
    }
});

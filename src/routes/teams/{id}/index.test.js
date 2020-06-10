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

test('[/v3/teams/:id] check that owners and admins can see owner, but members cannot', async t => {
    const { getTeamWithUser } = t.context;
    const { addUser, user: owner, session: ownerSession, team } = await getTeamWithUser();
    const { user: admin, session: adminSession } = await addUser('admin');
    const { user: member, session: memberSession } = await addUser('member');

    let teams = await t.context.server.inject({
        method: 'GET',
        url: `/v3/teams/${team.id}`,
        auth: {
            strategy: 'session',
            credentials: ownerSession,
            artifacts: owner
        }
    });

    t.is(typeof teams.result.owner, 'object');
    t.is(teams.result.owner.id, owner.id);

    teams = await t.context.server.inject({
        method: 'GET',
        url: `/v3/teams/${team.id}`,
        auth: {
            strategy: 'session',
            credentials: adminSession,
            artifacts: admin
        }
    });

    t.is(typeof teams.result.owner, 'object');
    t.is(teams.result.owner.id, owner.id);

    teams = await t.context.server.inject({
        method: 'GET',
        url: `/v3/teams/${team.id}`,
        auth: {
            strategy: 'session',
            credentials: memberSession,
            artifacts: member
        }
    });

    t.is(teams.result.owner, undefined);
});

test('[/v3/teams/:id] check that owners and admins can see settings, but members cannot', async t => {
    const { getTeamWithUser } = t.context;
    const { addUser, user: owner, session: ownerSession, team } = await getTeamWithUser();
    const { user: admin, session: adminSession } = await addUser('admin');
    const { user: member, session: memberSession } = await addUser('member');

    let teams = await t.context.server.inject({
        method: 'GET',
        url: `/v3/teams/${team.id}`,
        auth: {
            strategy: 'session',
            credentials: ownerSession,
            artifacts: owner
        }
    });

    t.is(typeof teams.result.settings, 'object');

    teams = await t.context.server.inject({
        method: 'GET',
        url: `/v3/teams/${team.id}`,
        auth: {
            strategy: 'session',
            credentials: adminSession,
            artifacts: admin
        }
    });

    t.is(typeof teams.result.settings, 'object');

    teams = await t.context.server.inject({
        method: 'GET',
        url: `/v3/teams/${team.id}`,
        auth: {
            strategy: 'session',
            credentials: memberSession,
            artifacts: member
        }
    });

    t.is(teams.result.settings, undefined);
});

test('user can fetch individual team', async t => {
    const teams = await t.context.server.inject({
        method: 'GET',
        url: `/v3/teams/${t.context.data.team.id}`,
        auth: t.context.auth
    });

    t.is(teams.statusCode, 200);
    t.is(teams.result.id, t.context.data.team.id);
    t.is(teams.result.name, 'Test Team');
});

test('user can not fetch teams they are not a part of', async t => {
    const data = await t.context.getUser();
    const teams = await t.context.server.inject({
        method: 'GET',
        url: `/v3/teams/${t.context.data.team.id}`,
        auth: {
            strategy: 'session',
            credentials: data.session,
            artifacts: data.user
        }
    });

    t.is(teams.statusCode, 401);
});

test('owners can edit team', async t => {
    const team = await t.context.server.inject({
        method: 'PATCH',
        url: `/v3/teams/${t.context.data.team.id}`,
        auth: t.context.auth,
        payload: {
            name: 'Testy'
        }
    });

    t.is(team.statusCode, 200);
    t.is(team.result.name, 'Testy');
    t.truthy(team.result.updatedAt);
});

test('admin can edit team', async t => {
    const { user } = await t.context.data.addUser('admin');

    const team = await t.context.server.inject({
        method: 'PATCH',
        url: `/v3/teams/${t.context.data.team.id}`,
        auth: { strategy: 'simple', credentials: { session: '' }, artifacts: user },
        payload: {
            name: 'Testy'
        }
    });

    t.is(team.statusCode, 200);
    t.is(team.result.name, 'Testy');
    t.truthy(team.result.updatedAt);
});

test('member can not edit team', async t => {
    const { user } = await t.context.data.addUser('member');

    const team = await t.context.server.inject({
        method: 'PATCH',
        url: `/v3/teams/${t.context.data.team.id}`,
        auth: { strategy: 'simple', credentials: { session: '' }, artifacts: user },
        payload: {
            name: 'Testy'
        }
    });

    t.is(team.statusCode, 401);
});

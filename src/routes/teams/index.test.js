const test = require('ava');
const nanoid = require('nanoid');
const { setup } = require('../../../test/helpers/setup');

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

test('user can fetch their teams', async t => {
    const teams = await t.context.server.inject({
        method: 'GET',
        url: '/v3/teams',
        auth: t.context.auth
    });

    t.is(teams.statusCode, 200);
    t.is(teams.result.total, 1);
    t.is(teams.result.list[0].id, t.context.data.team.id);
    t.is(teams.result.list[0].name, 'Test Team');
    t.is(teams.result.list[0].role, 'owner');
    t.is(typeof teams.result.list[0].settings, 'object');
});

test('[/v3/teams] check for correct memberCount', async t => {
    const { getTeamWithUser } = t.context;
    const { addUser, user: owner, session: ownerSession, team } = await getTeamWithUser();

    const ownerAuth = {
        strategy: 'session',
        credentials: ownerSession,
        artifacts: owner
    };

    let teams = await t.context.server.inject({
        method: 'GET',
        url: '/v3/teams',
        auth: ownerAuth
    });

    t.is(teams.statusCode, 200);
    t.is(teams.result.total, 1);
    t.is(teams.result.list[0].id, team.id);
    t.is(teams.result.list[0].memberCount, 1);

    await addUser('member');
    await addUser('member');

    teams = await t.context.server.inject({
        method: 'GET',
        url: '/v3/teams',
        auth: ownerAuth
    });

    t.is(teams.result.list[0].memberCount, 3);
});

test('[/v3/teams] check that owners and admins can see owner, but members cannot', async t => {
    const { getTeamWithUser } = t.context;
    const { addUser, user: owner, session: ownerSession } = await getTeamWithUser();
    const { user: admin, session: adminSession } = await addUser('admin');
    const { user: member, session: memberSession } = await addUser('member');

    let teams = await t.context.server.inject({
        method: 'GET',
        url: '/v3/teams',
        auth: {
            strategy: 'session',
            credentials: ownerSession,
            artifacts: owner
        }
    });

    t.is(typeof teams.result.list[0].owner, 'object');
    t.is(teams.result.list[0].owner.id, owner.id);

    teams = await t.context.server.inject({
        method: 'GET',
        url: '/v3/teams',
        auth: {
            strategy: 'session',
            credentials: adminSession,
            artifacts: admin
        }
    });

    t.is(typeof teams.result.list[0].owner, 'object');
    t.is(teams.result.list[0].owner.id, owner.id);

    teams = await t.context.server.inject({
        method: 'GET',
        url: '/v3/teams',
        auth: {
            strategy: 'session',
            credentials: memberSession,
            artifacts: member
        }
    });

    t.is(teams.result.list[0].owner, undefined);
});

test('[/v3/teams] check that owners and admins can see settings, but members cannot', async t => {
    const { getTeamWithUser } = t.context;
    const { addUser, user: owner, session: ownerSession } = await getTeamWithUser();
    const { user: admin, session: adminSession } = await addUser('admin');
    const { user: member, session: memberSession } = await addUser('member');

    let teams = await t.context.server.inject({
        method: 'GET',
        url: '/v3/teams',
        auth: {
            strategy: 'session',
            credentials: ownerSession,
            artifacts: owner
        }
    });

    t.is(typeof teams.result.list[0].settings, 'object');

    teams = await t.context.server.inject({
        method: 'GET',
        url: '/v3/teams',
        auth: {
            strategy: 'session',
            credentials: adminSession,
            artifacts: admin
        }
    });

    t.is(typeof teams.result.list[0].settings, 'object');

    teams = await t.context.server.inject({
        method: 'GET',
        url: '/v3/teams',
        auth: {
            strategy: 'session',
            credentials: memberSession,
            artifacts: member
        }
    });

    t.is(teams.result.list[0].settings, undefined);
});

test('admins can create teams', async t => {
    const teamId = `team-admin-${nanoid(5)}`;
    const { user: admin } = await t.context.getUser('admin');
    const auth = {
        strategy: 'simple',
        credentials: { session: '', access: { scope: ['team'] } },
        artifacts: admin
    };

    await t.context.addToCleanup('team', teamId);

    const team = await t.context.server.inject({
        method: 'POST',
        url: `/v3/teams`,
        auth,
        payload: {
            id: teamId,
            name: 'Test'
        }
    });

    t.is(team.statusCode, 201);

    t.is(team.result.name, 'Test');
    t.truthy(team.result.createdAt);
});

test('users can create teams', async t => {
    const team = await t.context.server.inject({
        method: 'POST',
        url: `/v3/teams`,
        auth: t.context.auth,
        payload: {
            id: 'test-user',
            name: 'Test'
        }
    });

    await t.context.addToCleanup('team', team.result.id);
    t.is(team.result.name, 'Test');
    t.is(team.statusCode, 201);
});

test('users can create teams with "Content-Type: text/plain"', async t => {
    const team = await t.context.server.inject({
        method: 'POST',
        url: `/v3/teams`,
        auth: t.context.auth,
        headers: {
            'content-type': 'text/plain'
        },
        payload: {
            id: 'test-user-plain',
            name: 'Test'
        }
    });

    await t.context.addToCleanup('team', team.result.id);
    t.is(team.result.name, 'Test');
    t.is(team.statusCode, 201);
});

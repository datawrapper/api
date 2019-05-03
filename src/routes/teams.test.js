import test from 'ava';
import { setup } from '../../test/helpers/setup';

test.before(async t => {
    const { server, getTeamWithUser, getUser } = await setup({ usePlugins: false });
    const data = await getTeamWithUser();

    t.context.getUser = getUser;
    t.context.server = server;
    t.context.data = data;
    t.context.auth = {
        strategy: 'session',
        credentials: data.session,
        artifacts: data.user
    };
});

test.after.always(async t => {
    await t.context.data.cleanup();
});

test('user can fetch their teams', async t => {
    let teams = await t.context.server.inject({
        method: 'GET',
        url: '/v3/teams',
        auth: t.context.auth
    });

    t.is(teams.statusCode, 200);
    t.is(teams.result.total, 1);
    t.is(teams.result.list[0].id, t.context.data.team.id);
    t.is(teams.result.list[0].name, 'Test Team');
});

test('user can fetch individual team', async t => {
    let teams = await t.context.server.inject({
        method: 'GET',
        url: `/v3/teams/${t.context.data.team.id}`,
        auth: t.context.auth
    });

    t.is(teams.statusCode, 200);
    t.is(teams.result.id, t.context.data.team.id);
    t.is(teams.result.name, 'Test Team');
});

test('anonymous user can not fetch teams', async t => {
    let teams = await t.context.server.inject({
        method: 'GET',
        url: '/v3/teams'
    });

    t.is(teams.statusCode, 401);

    teams = await t.context.server.inject({
        method: 'GET',
        url: `/v3/teams/${t.context.data.team.id}`
    });

    t.is(teams.statusCode, 401);

    teams = await t.context.server.inject({
        method: 'GET',
        url: `/v3/teams/${t.context.data.team.id}/members`
    });

    t.is(teams.statusCode, 401);
});

test('user can not fetch teams they are not a part of', async t => {
    const data = await t.context.getUser();
    let teams = await t.context.server.inject({
        method: 'GET',
        url: `/v3/teams/${t.context.data.team.id}`,
        auth: {
            strategy: 'session',
            credentials: data.session,
            artifacts: data.user
        }
    });

    t.is(teams.statusCode, 401);
    await data.cleanup();
});

test('user can fetch their team members', async t => {
    let teams = await t.context.server.inject({
        method: 'GET',
        url: `/v3/teams/${t.context.data.team.id}/members`,
        auth: t.context.auth
    });

    t.is(teams.statusCode, 200);
    t.true(Array.isArray(teams.result.list));
    t.is(teams.result.list[0].id, t.context.auth.artifacts.id);
    t.is(teams.result.total, 1);
});

test('user can not fetch team members of team they are not a part of', async t => {
    const data = await t.context.getUser();
    let teams = await t.context.server.inject({
        method: 'GET',
        url: `/v3/teams/${t.context.data.team.id}/members`,
        auth: {
            strategy: 'session',
            credentials: data.session,
            artifacts: data.user
        }
    });

    t.is(teams.statusCode, 401);
    await data.cleanup();
});

test('owner can remove team members', async t => {
    const { user } = await t.context.data.addUser('member');

    let teams = await t.context.server.inject({
        method: 'DELETE',
        url: `/v3/teams/${t.context.data.team.id}/members/12345`,
        auth: t.context.auth
    });

    t.is(teams.statusCode, 404);

    let member = await t.context.server.inject({
        method: 'GET',
        url: `/v3/teams/${t.context.data.team.id}/members`,
        auth: t.context.auth
    });

    let hasUser = !!member.result.list.find(m => m.id === user.id);

    t.true(hasUser);
    t.is(member.statusCode, 200);

    teams = await t.context.server.inject({
        method: 'DELETE',
        url: `/v3/teams/${t.context.data.team.id}/members/${user.id}`,
        auth: t.context.auth
    });

    t.is(teams.statusCode, 204);

    member = await t.context.server.inject({
        method: 'GET',
        url: `/v3/teams/${t.context.data.team.id}/members`,
        auth: t.context.auth
    });

    hasUser = !!member.result.list.find(m => m.id === user.id);
    t.false(hasUser);
});

test('owners can not get removed', async t => {
    const { user } = await t.context.data.addUser();

    const teams = await t.context.server.inject({
        method: 'DELETE',
        url: `/v3/teams/${t.context.data.team.id}/members/${user.id}`,
        auth: t.context.auth
    });

    t.is(teams.statusCode, 401);
    t.log(teams.result.message);
});

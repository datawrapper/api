import test from 'ava';
import { setup } from '../../test/helpers/setup';

test.before(async t => {
    const { server, getTeamWithUser, getUser, models } = await setup({ usePlugins: false });
    const data = await getTeamWithUser();

    t.context.models = models;
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

test('guest user can not fetch teams', async t => {
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

test('admins can create teams', async t => {
    const admin = await t.context.models.User.findByPk(1);
    const auth = { strategy: 'simple', credentials: { session: '' }, artifacts: admin };

    const team = await t.context.server.inject({
        method: 'POST',
        url: `/v3/teams`,
        auth,
        payload: {
            id: 'test-team',
            name: 'Test'
        }
    });

    await t.context.models.Team.destroy({ where: { id: 'test-team' } });

    t.is(team.statusCode, 201);
    t.is(team.result.id, 'test-team');
    t.is(team.result.name, 'Test');
    t.truthy(team.result.createdAt);
});

test('users can not create teams', async t => {
    const team = await t.context.server.inject({
        method: 'POST',
        url: `/v3/teams`,
        auth: t.context.auth,
        payload: {
            id: 'test-team',
            name: 'Test'
        }
    });

    t.is(team.statusCode, 401);
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

test('owners can invite new members to a team', async t => {
    const data = await t.context.getUser();
    const team = await t.context.server.inject({
        method: 'POST',
        url: `/v3/teams/${t.context.data.team.id}/members`,
        auth: t.context.auth,
        payload: {
            email: data.user.email
        }
    });

    await data.cleanup();

    t.is(team.statusCode, 201);
});

test('owners can invite new users to a team', async t => {
    const team = await t.context.server.inject({
        method: 'POST',
        url: `/v3/teams/${t.context.data.team.id}/members`,
        auth: t.context.auth,
        payload: {
            email: 'test-member@ava.de'
        }
    });

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

test('owners can change a members status', async t => {
    const { user } = await t.context.data.addUser('member');
    const team = await t.context.server.inject({
        method: 'PUT',
        url: `/v3/teams/${t.context.data.team.id}/members/${user.id}/status`,
        auth: t.context.auth,
        payload: {
            status: 'admin'
        }
    });

    t.is(team.statusCode, 204);

    /* clean up the user that got created with the POST request */
    const userTeam = await t.context.models.UserTeam.findOne({
        where: { user_id: user.id }
    });

    t.is(userTeam.dataValues.team_role, 1);
});

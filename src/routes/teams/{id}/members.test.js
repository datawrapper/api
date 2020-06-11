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

test('user can fetch their team members', async t => {
    const teams = await t.context.server.inject({
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
    const teams = await t.context.server.inject({
        method: 'GET',
        url: `/v3/teams/${t.context.data.team.id}/members`,
        auth: {
            strategy: 'session',
            credentials: data.session,
            artifacts: data.user
        }
    });

    t.is(teams.statusCode, 401);
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
    t.is(member.statusCode, 200);

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

test('owners cant change their own role', async t => {
    const team = await t.context.server.inject({
        method: 'PUT',
        url: `/v3/teams/${t.context.data.team.id}/members/${t.context.data.user.id}/status`,
        auth: t.context.auth,
        payload: {
            status: 'admin'
        }
    });

    t.is(team.statusCode, 403);
});

test('admins can add new members to a team', async t => {
    const data = await t.context.getUser();
    const { user: admin, session } = await t.context.getUser('admin');
    const team = await t.context.server.inject({
        method: 'POST',
        url: `/v3/teams/${t.context.data.team.id}/members`,
        auth: {
            strategy: 'session',
            credentials: session,
            artifacts: admin
        },
        payload: {
            userId: data.user.id,
            role: 'member'
        }
    });

    t.is(team.statusCode, 201);
});

test('members can leave teams but can not remove other members', async t => {
    const { team, addUser } = t.context.data;
    const { user, session } = await addUser('member');
    const { user: user2 } = await addUser('member');

    /* try to remove different member */
    let res = await t.context.server.inject({
        method: 'DELETE',
        url: `/v3/teams/${team.id}/members/${user2.id}`,
        auth: {
            strategy: 'session',
            credentials: session,
            artifacts: user
        }
    });

    t.is(res.statusCode, 401);

    /* check if user 2 is still in team */
    let row = await t.context.models.UserTeam.findByPk(user2.id);
    t.is(row.dataValues.organization_id, team.id);
    t.log('member could not remove a different team member');

    /* leave team */
    res = await t.context.server.inject({
        method: 'DELETE',
        url: `/v3/teams/${team.id}/members/${user.id}`,
        auth: {
            strategy: 'session',
            credentials: session,
            artifacts: user
        }
    });

    /* check if api call was successful */
    t.is(res.statusCode, 204);

    /* check if association got deleted */
    row = await t.context.models.UserTeam.findByPk(user.id);
    t.is(row, null);
    t.log('member could leave team');
});

test('admins can remove members, themselves but not owners', async t => {
    const { team, addUser } = t.context.data;
    const { user: admin, session } = await addUser('admin');
    const { user: member } = await addUser('member');
    const { user: owner } = await addUser('owner');

    let res = await t.context.server.inject({
        method: 'DELETE',
        url: `/v3/teams/${team.id}/members/${member.id}`,
        auth: {
            strategy: 'session',
            credentials: session,
            artifacts: admin
        }
    });

    /* check if api call was successful */
    t.is(res.statusCode, 204);

    /* check if association got deleted */
    let row = await t.context.models.UserTeam.findByPk(member.id);
    t.is(row, null);
    t.log('admin could remove member');

    res = await t.context.server.inject({
        method: 'DELETE',
        url: `/v3/teams/${team.id}/members/${owner.id}`,
        auth: {
            strategy: 'session',
            credentials: session,
            artifacts: admin
        }
    });

    /* check if api call was successful */
    t.is(res.statusCode, 401);

    /* check if association got deleted */
    row = await t.context.models.UserTeam.findByPk(owner.id);
    t.is(row.dataValues.organization_id, team.id);
    t.log('admin could not remove owner');

    /* leave team */
    res = await t.context.server.inject({
        method: 'DELETE',
        url: `/v3/teams/${team.id}/members/${admin.id}`,
        auth: {
            strategy: 'session',
            credentials: session,
            artifacts: admin
        }
    });

    /* check if api call was successful */
    t.is(res.statusCode, 204);

    /* check if association got deleted */
    row = await t.context.models.UserTeam.findByPk(admin.id);
    t.is(row, null);
    t.log('admin could leave team');
});

test('Datawrapper admins can not change their own role if they are the team owner', async t => {
    const { user: admin, session } = await t.context.getUser('admin');
    const { team } = await t.context.getTeamWithUser('member');

    let userTeamRow = await t.context.models.UserTeam.create({
        user_id: admin.id,
        organization_id: team.id,
        team_role: 'owner'
    });

    t.is(userTeamRow.user_id, admin.id);
    t.is(userTeamRow.team_role, 'owner');
    t.is(userTeamRow.organization_id, team.id);

    const res = await t.context.server.inject({
        method: 'PUT',
        url: `/v3/teams/${team.id}/members/${admin.id}/status`,
        headers: {
            cookie: `DW-SESSION=${session.id}`
        },
        payload: {
            status: 'member'
        }
    });

    t.is(res.statusCode, 403);

    userTeamRow = await t.context.models.UserTeam.findOne({
        where: {
            user_id: admin.id,
            organization_id: team.id
        }
    });

    t.is(userTeamRow.team_role, 'owner');
});

test('users not part of a team can not change a team members role', async t => {
    const { session } = await t.context.getUser();
    const { team, user: teamMember } = await t.context.getTeamWithUser('member');

    const res = await t.context.server.inject({
        method: 'PUT',
        url: `/v3/teams/${team.id}/members/${teamMember.id}/status`,
        headers: {
            cookie: `DW-SESSION=${session.id}`
        },
        payload: {
            status: 'member'
        }
    });

    t.is(res.statusCode, 401);
});

test('Datawrapper admins can change member roles', async t => {
    const { session } = await t.context.getUser('admin');
    const { team, addUser } = await t.context.getTeamWithUser();
    const teamMember = await addUser('member');

    let userTeamRow = await t.context.models.UserTeam.findOne({
        where: {
            user_id: teamMember.user.id,
            organization_id: team.id
        }
    });

    t.is(userTeamRow.team_role, 'member');

    const res = await t.context.server.inject({
        method: 'PUT',
        url: `/v3/teams/${team.id}/members/${teamMember.user.id}/status`,
        headers: {
            cookie: `DW-SESSION=${session.id}`
        },
        payload: {
            status: 'admin'
        }
    });

    t.is(res.statusCode, 204);
    userTeamRow = await t.context.models.UserTeam.findOne({
        where: {
            user_id: teamMember.user.id,
            organization_id: team.id
        }
    });

    t.is(userTeamRow.team_role, 'admin');
});

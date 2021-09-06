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

test('guest user can not fetch teams', async t => {
    let teams = await t.context.server.inject({
        method: 'GET',
        url: '/v3/teams'
    });

    t.is(teams.statusCode, 401);

    teams = await t.context.server.inject({
        method: 'GET',
        url: `/v3/teams/${t.context.teamObj.team.id}`
    });

    t.is(teams.statusCode, 401);

    teams = await t.context.server.inject({
        method: 'GET',
        url: `/v3/teams/${t.context.teamObj.team.id}/members`
    });

    t.is(teams.statusCode, 401);
});

test('user can fetch their team members', async t => {
    const teams = await t.context.server.inject({
        method: 'GET',
        url: `/v3/teams/${t.context.teamObj.team.id}/members`,
        auth: t.context.auth
    });

    t.is(teams.statusCode, 200);
    t.true(Array.isArray(teams.result.list));
    t.is(teams.result.list[0].id, t.context.auth.artifacts.id);
    t.is(teams.result.total, 1);
});

test('user can not fetch team members of team they are not a part of', async t => {
    let userObj;
    try {
        userObj = await createUser(t.context.server);
        const teams = await t.context.server.inject({
            method: 'GET',
            url: `/v3/teams/${t.context.teamObj.team.id}/members`,
            auth: {
                strategy: 'session',
                credentials: userObj.session,
                artifacts: userObj.user
            }
        });

        t.is(teams.statusCode, 401);
    } finally {
        if (userObj) {
            await destroy(...Object.values(userObj));
        }
    }
});

test('owner can remove team members', async t => {
    let userObj;
    try {
        userObj = await t.context.teamObj.addUser('member');
        const { user } = userObj;

        let teams = await t.context.server.inject({
            method: 'DELETE',
            url: `/v3/teams/${t.context.teamObj.team.id}/members/12345`,
            auth: t.context.auth,
            headers: t.context.headers
        });

        t.is(teams.statusCode, 404);

        let member = await t.context.server.inject({
            method: 'GET',
            url: `/v3/teams/${t.context.teamObj.team.id}/members`,
            auth: t.context.auth
        });
        t.is(member.statusCode, 200);

        let hasUser = !!member.result.list.find(m => m.id === user.id);

        t.true(hasUser);
        t.is(member.statusCode, 200);

        teams = await t.context.server.inject({
            method: 'DELETE',
            url: `/v3/teams/${t.context.teamObj.team.id}/members/${user.id}`,
            auth: t.context.auth,
            headers: t.context.headers
        });

        t.is(teams.statusCode, 204);

        member = await t.context.server.inject({
            method: 'GET',
            url: `/v3/teams/${t.context.teamObj.team.id}/members`,
            auth: t.context.auth
        });

        hasUser = !!member.result.list.find(m => m.id === user.id);
        t.false(hasUser);
    } finally {
        if (userObj) {
            await destroy(...Object.values(userObj));
        }
    }
});

test('owners can not get removed', async t => {
    const { user } = await t.context.teamObj.addUser();

    const teams = await t.context.server.inject({
        method: 'DELETE',
        url: `/v3/teams/${t.context.teamObj.team.id}/members/${user.id}`,
        auth: t.context.auth,
        headers: t.context.headers
    });

    t.is(teams.statusCode, 401);
    t.log(teams.result.message);
});

test('owners can change a members status', async t => {
    const { UserTeam } = require('@datawrapper/orm/models');
    let userObj;
    try {
        userObj = await t.context.teamObj.addUser('member');
        const { user } = userObj;

        const team = await t.context.server.inject({
            method: 'PUT',
            url: `/v3/teams/${t.context.teamObj.team.id}/members/${user.id}/status`,
            auth: t.context.auth,
            headers: t.context.headers,
            payload: {
                status: 'admin'
            }
        });

        t.is(team.statusCode, 204);

        /* clean up the user that got created with the POST request */
        const userTeam = await UserTeam.findOne({
            where: { user_id: user.id }
        });

        t.is(userTeam.dataValues.team_role, 1);
    } finally {
        if (userObj) {
            await destroy(...Object.values(userObj));
        }
    }
});

test('owners cant change their own role', async t => {
    const team = await t.context.server.inject({
        method: 'PUT',
        url: `/v3/teams/${t.context.teamObj.team.id}/members/${t.context.teamObj.user.id}/status`,
        auth: t.context.auth,
        headers: t.context.headers,
        payload: {
            status: 'admin'
        }
    });

    t.is(team.statusCode, 403);
});

test('admins can add new members to a team', async t => {
    let userObj;
    let adminObj;
    try {
        userObj = await createUser(t.context.server);
        const { user } = userObj;
        adminObj = await createUser(t.context.server, 'admin');
        const { user: admin, session } = adminObj;

        const team = await t.context.server.inject({
            method: 'POST',
            url: `/v3/teams/${t.context.teamObj.team.id}/members`,
            auth: {
                strategy: 'session',
                credentials: session,
                artifacts: admin
            },
            headers: t.context.headers,
            payload: {
                userId: user.id,
                role: 'member'
            }
        });

        t.is(team.statusCode, 201);
    } finally {
        if (userObj) {
            await destroy(...Object.values(userObj));
        }
        if (adminObj) {
            await destroy(...Object.values(adminObj));
        }
    }
});

test('members can leave teams but can not remove other members', async t => {
    const { UserTeam } = require('@datawrapper/orm/models');
    const { team, addUser } = t.context.teamObj;
    let memberObj1;
    let memberObj2;
    try {
        memberObj1 = await addUser('member');
        memberObj2 = await addUser('member');
        const { user, session } = memberObj1;
        const { user: user2 } = memberObj2;

        /* try to remove different member */
        let res = await t.context.server.inject({
            method: 'DELETE',
            url: `/v3/teams/${team.id}/members/${user2.id}`,
            auth: {
                strategy: 'session',
                credentials: session,
                artifacts: user
            },
            headers: t.context.headers
        });

        t.is(res.statusCode, 401);

        /* check if user 2 is still in team */
        let row = await UserTeam.findByPk(user2.id);
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
            },
            headers: t.context.headers
        });

        /* check if api call was successful */
        t.is(res.statusCode, 204);

        /* check if association got deleted */
        row = await UserTeam.findByPk(user.id);
        t.is(row, null);
        t.log('member could leave team');
    } finally {
        if (memberObj1) {
            await destroy(...Object.values(memberObj1));
        }
        if (memberObj2) {
            await destroy(...Object.values(memberObj2));
        }
    }
});

test('admins can remove members, themselves but not owners', async t => {
    const { UserTeam } = require('@datawrapper/orm/models');
    const { team, addUser } = t.context.teamObj;
    let adminObj;
    let memberObj;
    let ownerObj;
    try {
        adminObj = await addUser('admin');
        const { user: admin, session } = adminObj;
        memberObj = await addUser('member');
        const { user: member } = memberObj;
        ownerObj = await addUser('owner');
        const { user: owner } = ownerObj;

        let res = await t.context.server.inject({
            method: 'DELETE',
            url: `/v3/teams/${team.id}/members/${member.id}`,
            auth: {
                strategy: 'session',
                credentials: session,
                artifacts: admin
            },
            headers: t.context.headers
        });
        /* check if api call was successful */
        t.is(res.statusCode, 204);

        /* check if association got deleted */
        let row = await UserTeam.findByPk(member.id);
        t.is(row, null);
        t.log('admin could remove member');

        res = await t.context.server.inject({
            method: 'DELETE',
            url: `/v3/teams/${team.id}/members/${owner.id}`,
            auth: {
                strategy: 'session',
                credentials: session,
                artifacts: admin
            },
            headers: t.context.headers
        });

        /* check if api call was successful */
        t.is(res.statusCode, 401);

        /* check if association got deleted */
        row = await UserTeam.findByPk(owner.id);
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
            },
            headers: t.context.headers
        });

        /* check if api call was successful */
        t.is(res.statusCode, 204);

        /* check if association got deleted */

        row = await UserTeam.findByPk(admin.id);
        t.is(row, null);
        t.log('admin could leave team');
    } finally {
        if (adminObj) {
            await destroy(...Object.values(adminObj));
        }
        if (memberObj) {
            await destroy(...Object.values(memberObj));
        }
        if (ownerObj) {
            await destroy(...Object.values(ownerObj));
        }
    }
});

test('Datawrapper admins can not change their own role if they are the team owner', async t => {
    const { UserTeam } = require('@datawrapper/orm/models');
    let adminObj;
    let teamObj;
    try {
        adminObj = await createUser(t.context.server, 'admin');
        const { user: admin, session } = adminObj;
        teamObj = await createTeamWithUser(t.context.server, 'member');
        const { team } = teamObj;

        let userTeamRow = await UserTeam.create({
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
                cookie: `DW-SESSION=${session.id}; crumb=abc`,
                'X-CSRF-Token': 'abc',
                referer: 'http://localhost'
            },
            payload: {
                status: 'member'
            }
        });

        t.is(res.statusCode, 403);

        userTeamRow = await UserTeam.findOne({
            where: {
                user_id: admin.id,
                organization_id: team.id
            }
        });

        t.is(userTeamRow.team_role, 'owner');
    } finally {
        if (adminObj) {
            await destroy(...Object.values(adminObj));
        }
        if (teamObj) {
            await destroy(...Object.values(teamObj));
        }
    }
});

test('users not part of a team can not change a team members role', async t => {
    let userObj;
    let teamObj;
    try {
        userObj = await createUser(t.context.server);
        const { session } = userObj;
        teamObj = await createTeamWithUser(t.context.server, 'member');
        const { team, user: teamMember } = teamObj;

        const res = await t.context.server.inject({
            method: 'PUT',
            url: `/v3/teams/${team.id}/members/${teamMember.id}/status`,
            headers: {
                cookie: `DW-SESSION=${session.id}; crumb=abc`,
                'X-CSRF-Token': 'abc',
                referer: 'http://localhost'
            },
            payload: {
                status: 'member'
            }
        });

        t.is(res.statusCode, 401);
    } finally {
        if (userObj) {
            await destroy(...Object.values(userObj));
        }
        if (teamObj) {
            await destroy(...Object.values(teamObj));
        }
    }
});

test('Datawrapper admins can change member roles', async t => {
    const { UserTeam } = require('@datawrapper/orm/models');
    let userObj;
    let teamObj;
    try {
        userObj = await createUser(t.context.server, 'admin');
        const { session } = userObj;
        teamObj = await createTeamWithUser(t.context.server);
        const { team, addUser } = teamObj;
        const teamMember = await addUser('member');

        let userTeamRow = await UserTeam.findOne({
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
                cookie: `DW-SESSION=${session.id}; crumb=abc`,
                'X-CSRF-Token': 'abc',
                referer: 'http://localhost'
            },
            payload: {
                status: 'admin'
            }
        });

        t.is(res.statusCode, 204);
        userTeamRow = await UserTeam.findOne({
            where: {
                user_id: teamMember.user.id,
                organization_id: team.id
            }
        });

        t.is(userTeamRow.team_role, 'admin');
    } finally {
        if (userObj) {
            await destroy(...Object.values(userObj));
        }
        if (teamObj) {
            await destroy(...Object.values(teamObj));
        }
    }
});

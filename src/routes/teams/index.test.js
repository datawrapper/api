const test = require('ava');
const { nanoid } = require('nanoid');
const { createTeamWithUser, createUser, destroy, setup } = require('../../../test/helpers/setup');

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

test('user can fetch their teams', async t => {
    const teams = await t.context.server.inject({
        method: 'GET',
        url: '/v3/teams',
        auth: t.context.auth
    });

    t.is(teams.statusCode, 200);
    t.is(teams.result.total, 1);
    t.is(teams.result.list[0].id, t.context.teamObj.team.id);
    t.is(teams.result.list[0].name, 'Test Team');
    t.is(teams.result.list[0].role, 'owner');
    t.is(typeof teams.result.list[0].settings, 'object');
});

test('[/v3/teams] check for correct memberCount', async t => {
    let teamObj;
    const userObjs = [];
    try {
        teamObj = await createTeamWithUser(t.context.server);
        const { addUser, user: owner, session: ownerSession, team } = teamObj;

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

        userObjs.push(await addUser('member'));
        userObjs.push(await addUser('member'));

        teams = await t.context.server.inject({
            method: 'GET',
            url: '/v3/teams',
            auth: ownerAuth
        });

        t.is(teams.result.list[0].memberCount, 3);
    } finally {
        if (teamObj) {
            await destroy(...Object.values(teamObj));
        }
        for (const userObj of userObjs) {
            await destroy(...Object.values(userObj));
        }
    }
});

test('[/v3/teams] check that owners and admins can see owner, but members cannot', async t => {
    let teamObj;
    const userObjs = [];
    try {
        teamObj = await createTeamWithUser(t.context.server);
        const { addUser, user: owner, session: ownerSession } = teamObj;
        const adminObj = await addUser('admin');
        userObjs.push(adminObj);
        const { user: admin, session: adminSession } = adminObj;
        const userObj = await addUser('member');
        userObjs.push(userObj);
        const { user: member, session: memberSession } = userObj;

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
    } finally {
        if (teamObj) {
            await destroy(...Object.values(teamObj));
        }
        for (const userObj of userObjs) {
            await destroy(...Object.values(userObj));
        }
    }
});

test('[/v3/teams] check that owners and admins can see settings, but members cannot', async t => {
    let teamObj;
    const userObjs = [];
    try {
        teamObj = await createTeamWithUser(t.context.server);
        const { addUser, user: owner, session: ownerSession } = teamObj;
        const adminObj = await addUser('admin');
        userObjs.push(adminObj);
        const { user: admin, session: adminSession } = adminObj;
        const userObj = await addUser('member');
        userObjs.push(userObj);
        const { user: member, session: memberSession } = userObj;

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
    } finally {
        if (teamObj) {
            await destroy(...Object.values(teamObj));
        }
        for (const userObj of userObjs) {
            await destroy(...Object.values(userObj));
        }
    }
});

test('admins can create teams', async t => {
    const teamId = `team-admin-${nanoid(5)}`;
    let userObj;
    try {
        userObj = await createUser(t.context.server, 'admin');
        const { user: admin } = userObj;
        const auth = {
            strategy: 'simple',
            credentials: { session: '', scope: ['team:write'] },
            artifacts: admin
        };

        const res = await t.context.server.inject({
            method: 'POST',
            url: `/v3/teams`,
            auth,
            headers: t.context.headers,
            payload: {
                id: teamId,
                name: 'Test'
            }
        });

        t.is(res.statusCode, 201);

        t.is(res.result.name, 'Test');
        t.truthy(res.result.createdAt);
    } finally {
        if (userObj) {
            await destroy(...Object.values(userObj));
        }
        const { Team } = require('@datawrapper/orm/models');
        const team = await Team.findByPk(teamId);
        await destroy(team);
    }
});

test('users can create teams', async t => {
    const teamId = 'test-user';
    try {
        const res = await t.context.server.inject({
            method: 'POST',
            url: `/v3/teams`,
            auth: t.context.auth,
            headers: t.context.headers,
            payload: {
                id: teamId,
                name: 'Test'
            }
        });

        t.is(res.result.name, 'Test');
        t.is(res.statusCode, 201);
    } finally {
        const { Team } = require('@datawrapper/orm/models');
        const team = await Team.findByPk(teamId);
        await destroy(team);
    }
});

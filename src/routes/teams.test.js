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
    t.is(teams.result.list[0].id, 'test');
    t.is(teams.result.list[0].name, 'Test Team');
});

test('user can fetch individual team', async t => {
    let teams = await t.context.server.inject({
        method: 'GET',
        url: '/v3/teams/test',
        auth: t.context.auth
    });

    t.is(teams.statusCode, 200);
    t.is(teams.result.id, 'test');
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
        url: '/v3/teams/test'
    });

    t.is(teams.statusCode, 401);
});

test('user can not fetch teams they are not a part of', async t => {
    const data = await t.context.getUser();
    let teams = await t.context.server.inject({
        method: 'GET',
        url: '/v3/teams/test',
        auth: {
            strategy: 'session',
            credentials: data.session,
            artifacts: data.user
        }
    });

    t.is(teams.statusCode, 404);
    await data.cleanup();
});

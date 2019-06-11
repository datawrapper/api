import test from 'ava';
import nanoid from 'nanoid';

import { setup } from '../../test/helpers/setup';

test.before(async t => {
    const { server, models, getUser, getTeamWithUser } = await setup({ usePlugins: false });
    t.context.server = server;

    const { User } = models;
    t.context.User = User;
    t.context.deleteUserFromDB = async email => {
        const user = await User.findOne({
            where: { email },
            attributes: ['id']
        });

        await user.destroy();
    };

    t.context.getUser = getUser;
    t.context.getTeamWithUser = getTeamWithUser;
});

test('It should be possible to create a user, login and logout', async t => {
    const credentials = {
        email: `test-${nanoid(5)}@ava.de`,
        password: 'strong-secure-password'
    };

    /* create user with email and some data */
    let res = await t.context.server.inject({
        method: 'POST',
        url: '/v3/users',
        payload: { ...credentials, language: 'de-DE' }
    });

    t.log('User created', res.result.email);

    t.is(res.statusCode, 201);
    t.is(res.result.email, credentials.email);
    t.is(res.result.language, 'de-DE');

    /* login as newly created user */
    res = await t.context.server.inject({
        method: 'POST',
        url: '/v3/auth/login',
        payload: credentials
    });

    t.log('Logged in', credentials.email);

    const session = res.result['DW-SESSION'];
    const cookieString = `DW-SESSION=${session}`;
    t.is(typeof session, 'string');
    t.is(res.statusCode, 200);
    t.true(res.headers['set-cookie'].join().includes(cookieString));

    /* logout */
    res = await t.context.server.inject({
        method: 'POST',
        url: '/v3/auth/logout',
        headers: {
            cookie: cookieString
        }
    });

    t.log('Logged out', credentials.email);

    t.is(res.statusCode, 205);
    t.false(res.headers['set-cookie'].join().includes(cookieString));
    t.is(res.headers[('clear-site-data', '"cookies", "storage", "executionContexts"')]);

    /* start - replace with DELETE endpoint in the future */
    await t.context.deleteUserFromDB(credentials.email);
    t.log('Deleted', credentials.email);
    /* end */
});

test('New user passwords should be saved as bcrypt hash', async t => {
    const credentials = {
        email: `test-${nanoid(5)}@ava.de`,
        password: 'strong-secure-password'
    };

    /* create user with email and some data */
    const { result } = await t.context.server.inject({
        method: 'POST',
        url: '/v3/users',
        payload: { ...credentials, language: 'de-DE' }
    });

    t.log('User created', result.email);

    const user = await t.context.User.findByPk(result.id, { attributes: ['pwd'] });

    t.is(user.pwd.slice(0, 2), '$2');

    await t.context.deleteUserFromDB(credentials.email);
    t.log('Deleted', credentials.email);
});

test('GET /users/:id - should include teams when fetched as admin', async t => {
    /* create admin user to fetch different user with team */
    const { user, session, cleanup } = await t.context.getUser('admin');

    /* create a team with user to fetch */
    const team = await t.context.getTeamWithUser();

    const res = await t.context.server.inject({
        method: 'GET',
        url: `/v3/users/${team.user.id}`,
        auth: {
            strategy: 'session',
            credentials: session,
            artifacts: user
        }
    });

    t.is(res.result.teams.length, 1);
    t.is(res.result.teams[0].id, team.team.id);
    t.is(res.result.teams[0].name, team.team.name);
    t.is(res.result.teams[0].url, `/v3/teams/${team.team.id}`);

    /* cleanup db entries */
    await cleanup();
    await team.cleanup();
});

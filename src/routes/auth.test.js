import test from 'ava';

import { setup } from '../../test/helpers/setup';

function parseSetCookie(string) {
    const cookie = {};
    string
        .split(';')
        .map(str => str.trim().split('='))
        .forEach(value => {
            cookie[value[0]] = value[1] || true;
        });
    return cookie;
}

test.before(async t => {
    const { server, models, getUser, getCredentials, addToCleanup, getTeamWithUser } = await setup({
        usePlugins: false
    });

    t.context.server = server;

    const { user, session, token } = await getUser();
    t.context.user = user;
    t.context.session = session.id;
    t.context.token = token;
    t.context.models = models;
    t.context.getUser = getUser;
    t.context.getTeamWithUser = getTeamWithUser;
    t.context.getCredentials = getCredentials;
    t.context.addToCleanup = addToCleanup;
});

test('Login and logout work with correct credentials', async t => {
    let res = await t.context.server.inject({
        method: 'POST',
        url: '/v3/auth/login',
        payload: {
            email: t.context.user.email,
            password: 'test-password'
        }
    });

    t.truthy(res.result['DW-SESSION']);
    t.is(res.statusCode, 200);

    const session = res.result['DW-SESSION'];
    res = await t.context.server.inject({
        method: 'POST',
        url: '/v3/auth/logout',
        headers: {
            cookie: `DW-SESSION=${session}`
        }
    });

    t.is(res.statusCode, 205);
    t.is(res.headers['clear-site-data'], '"cookies", "storage", "executionContexts"');
    t.true(res.headers['set-cookie'][0].includes('DW-SESSION=;'));
    t.false(res.headers['set-cookie'].includes(session));
});

test('Login fails with incorrect credentials', async t => {
    const res = await t.context.server.inject({
        method: 'POST',
        url: '/v3/auth/login',
        payload: {
            email: t.context.user.email,
            password: 'hunter2'
        }
    });

    t.is(res.statusCode, 401);
});

test("Login set's correct cookie", async t => {
    let res = await t.context.server.inject({
        method: 'POST',
        url: '/v3/auth/login',
        payload: {
            email: t.context.user.email,
            password: 'test-password'
        }
    });

    let cookie = parseSetCookie(res.headers['set-cookie'][0]);
    t.log('session', cookie['DW-SESSION']);
    await t.context.addToCleanup('session', cookie['DW-SESSION']);
    let maxAge = cookie['Max-Age'] / 24 / 60 / 60; // convert to seconds

    t.true(cookie.HttpOnly);
    t.is(maxAge, 90);

    res = await t.context.server.inject({
        method: 'POST',
        url: '/v3/auth/login',
        payload: {
            email: t.context.user.email,
            password: 'test-password',
            keepSession: false
        }
    });

    cookie = parseSetCookie(res.headers['set-cookie'][0]);
    t.log('session', cookie['DW-SESSION']);
    await t.context.addToCleanup('session', cookie['DW-SESSION']);
    maxAge = cookie['Max-Age'] / 24 / 60 / 60; // convert to seconds

    t.is(maxAge, 30);
});

test('Logout errors with invalid session', async t => {
    const res = await t.context.server.inject({
        method: 'POST',
        url: '/v3/auth/logout',
        headers: {
            cookie: `DW-SESSION=Loki`
        }
    });

    t.is(res.statusCode, 401);
    t.is(res.result.message, 'Session not found');
});

test('Logout errors with token', async t => {
    const res = await t.context.server.inject({
        method: 'POST',
        url: '/v3/auth/logout',
        headers: {
            authorization: `Bearer ${t.context.token}`
        }
    });

    t.is(res.statusCode, 401);
    t.is(res.result.message, 'Session not found');
});

test('Tokens can be created, fetched and deleted', async t => {
    const auth = {
        strategy: 'session',
        credentials: { session: t.context.session },
        artifacts: { id: t.context.user.id }
    };

    let res = await t.context.server.inject({
        method: 'POST',
        url: '/v3/auth/tokens',
        payload: { comment: 'Test Token' },
        auth
    });

    const tokenId = res.result.id;
    t.is(res.result.comment, 'Test Token');
    t.truthy(res.result);

    res = await t.context.server.inject({
        method: 'GET',
        url: '/v3/auth/tokens',
        auth
    });

    t.true(Array.isArray(res.result.list));
    t.is(res.result.list.length, res.result.total);

    res = await t.context.server.inject({
        method: 'DELETE',
        url: `/v3/auth/tokens/${tokenId}`,
        auth
    });

    t.is(res.statusCode, 204);
});

test('Can create guest sessions', async t => {
    let res = await t.context.server.inject({
        method: 'POST',
        url: '/v3/auth/session'
    });

    const sessionToken = res.result['DW-SESSION'];

    t.truthy(res.result['DW-SESSION']);
    t.true(res.headers['set-cookie'][0].includes(`DW-SESSION=${sessionToken}`));

    res = await t.context.server.inject({
        method: 'POST',
        url: '/v3/auth/session',
        headers: {
            cookie: `DW-SESSION=${sessionToken}`
        }
    });

    t.is(sessionToken, res.result['DW-SESSION']);

    await t.context.server.inject({
        method: 'POST',
        url: '/v3/auth/logout',
        headers: {
            cookie: `DW-SESSION=${sessionToken}`
        }
    });
});

test('Guest charts are associated after signup', async t => {
    /* Get guest session */
    let res = await t.context.server.inject({
        method: 'POST',
        url: '/v3/auth/session'
    });

    t.is(res.statusCode, 200);

    const session = res.result['DW-SESSION'];

    /* Create chart as guest */
    res = await t.context.server.inject({
        method: 'POST',
        url: '/v3/charts',
        headers: {
            cookie: `DW-SESSION=${session}`
        },
        payload: {
            title: 'Test guest chart'
        }
    });

    const chartId = res.result.id;
    t.log('Chart ID:', chartId);
    t.is(res.result.title, 'Test guest chart');
    t.is(res.result.authorId, undefined);

    res = await t.context.server.inject({
        method: 'POST',
        url: '/v3/auth/signup',
        headers: {
            cookie: `DW-SESSION=${session}`
        },
        payload: t.context.getCredentials()
    });

    const authorId = res.result.id;
    t.log('Author ID:', authorId);
    await t.context.addToCleanup('user', authorId);

    const charts = await t.context.models.Chart.findAll({
        where: {
            author_id: authorId
        }
    });

    t.is(charts.length, 1);
    t.is(charts[0].id, chartId);
});

test('Guest charts are associated after login', async t => {
    /* Get guest session */
    let res = await t.context.server.inject({
        method: 'POST',
        url: '/v3/auth/session'
    });

    t.is(res.statusCode, 200);
    const session = res.result['DW-SESSION'];

    /* Create chart as guest */
    res = await t.context.server.inject({
        method: 'POST',
        url: '/v3/charts',
        headers: {
            cookie: `DW-SESSION=${session}`
        },
        payload: {
            title: 'Test guest chart'
        }
    });

    const chartId = res.result.id;
    t.log('Chart ID:', chartId);
    t.is(res.result.title, 'Test guest chart');
    t.is(res.result.authorId, undefined);

    const { user } = await t.context.getUser();

    res = await t.context.server.inject({
        method: 'POST',
        url: '/v3/auth/login',
        headers: {
            cookie: `DW-SESSION=${session}`
        },
        payload: {
            email: user.email,
            password: 'test-password'
        }
    });

    const charts = await t.context.models.Chart.findAll({
        where: {
            author_id: user.id
        }
    });

    t.is(charts.length, 1);
    t.is(charts[0].id, chartId);
});

test('user activation after team invite', async t => {
    const { addToCleanup, getTeamWithUser, getCredentials } = t.context;
    // create a team with user who is team owner
    const { team, session: ownerSession } = await getTeamWithUser();
    // get credentials for new user
    const credentials = getCredentials();
    // invite a new user to this team
    let res = await t.context.server.inject({
        method: 'POST',
        url: `/v3/teams/${team.id}/invites`,
        headers: {
            cookie: `DW-SESSION=${ownerSession.id}`
        },
        payload: {
            email: credentials.email,
            role: 'member'
        }
    });
    t.is(res.statusCode, 201);

    const { User } = t.context.models;
    const invitee = await User.findOne({ where: { email: credentials.email } });
    await addToCleanup('user', invitee.id);

    // get guest session
    res = await t.context.server.inject({
        method: 'POST',
        url: '/v3/auth/session'
    });

    t.is(res.statusCode, 200);
    const guestSession = res.result['DW-SESSION'];

    // activate new user using guest session
    res = await t.context.server.inject({
        method: 'POST',
        url: `/v3/auth/activate/${invitee.activate_token}`,
        headers: {
            cookie: `DW-SESSION=${guestSession}`
        }
    });
    t.is(res.statusCode, 204);

    // check if user is logged in now
    res = await t.context.server.inject({
        method: 'GET',
        url: `/v3/me`,
        headers: {
            cookie: `DW-SESSION=${guestSession}`
        }
    });

    t.is(res.statusCode, 200);
    t.is(res.result.email, credentials.email);
});

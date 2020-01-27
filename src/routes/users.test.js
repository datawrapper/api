import test from 'ava';
import sortBy from 'lodash/sortBy';
import { decamelize, decamelizeKeys } from 'humps';

import { setup } from '../../test/helpers/setup';

test.before(async t => {
    const { server, models, getUser, getTeamWithUser, getCredentials, addToCleanup } = await setup({
        usePlugins: false
    });
    t.context.server = server;

    t.context.user = await getUser();
    t.context.admin = await getUser('admin');
    t.context.models = models;

    t.context.getUser = getUser;
    t.context.getTeamWithUser = getTeamWithUser;
    t.context.getCredentials = getCredentials;
    t.context.addToCleanup = addToCleanup;
});

test('It should be possible to create a user, login and logout', async t => {
    const credentials = t.context.getCredentials();

    /* create user with email and some data */
    let res = await t.context.server.inject({
        method: 'POST',
        url: '/v3/users',
        payload: { ...credentials, language: 'de-DE' }
    });

    t.log('User created', res.result.email);
    await t.context.addToCleanup('user', res.result.id);

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
});

test('New user passwords should be saved as bcrypt hash', async t => {
    const credentials = t.context.getCredentials();

    /* create user with email and some data */
    const { result } = await t.context.server.inject({
        method: 'POST',
        url: '/v3/users',
        payload: { ...credentials, language: 'de-DE' }
    });

    t.log('User created', result.email);

    const user = await t.context.models.User.findByPk(result.id, { attributes: ['pwd'] });

    t.is(user.pwd.slice(0, 2), '$2');

    await t.context.addToCleanup('user', result.id);
});

test("New users can't set their role to admin", async t => {
    const credentials = t.context.getCredentials();

    /* create user with email and some data */
    const { result } = await t.context.server.inject({
        method: 'POST',
        url: '/v3/users',
        payload: { ...credentials, role: 'admin' }
    });

    t.log('User created', result.email);

    const user = await t.context.models.User.findByPk(result.id, { attributes: ['role'] });

    t.is(user.role, 'pending');
    await t.context.addToCleanup('user', result.id);
});

test("New users can't set protected fields", async t => {
    const credentials = t.context.getCredentials();

    const fields = {
        id: 123455789,
        activateToken: '12345',
        deleted: true,
        resetPasswordToken: '12345',
        customerId: 12345,
        oauthSignin: 'blub'
    };
    /* create user with email and some data */
    const { result } = await t.context.server.inject({
        method: 'POST',
        url: '/v3/users',
        payload: { ...credentials, ...fields }
    });

    t.log('User created', result.email);

    const user = await t.context.models.User.findByPk(result.id, {
        attributes: Object.keys(decamelizeKeys(fields))
    });

    for (const f in fields) {
        t.not(user[decamelize(f)], fields[f]);
    }
    await t.context.addToCleanup('user', result.id);
});

test('GET /users/:id - should include teams when fetched as admin', async t => {
    /* create admin user to fetch different user with team */
    const { session } = t.context.admin;

    /* create a team with user to fetch */
    const team = await t.context.getTeamWithUser();

    const res = await t.context.server.inject({
        method: 'GET',
        url: `/v3/users/${team.user.id}`,
        headers: {
            cookie: `DW-SESSION=${session.id}`
        }
    });

    t.is(res.result.teams.length, 1);
    t.is(res.result.teams[0].id, team.team.id);
    t.is(res.result.teams[0].name, team.team.name);
    t.is(res.result.teams[0].url, `/v3/teams/${team.team.id}`);
});

test('Users endpoints should return 404 if no user was found', async t => {
    const { session } = t.context.admin;
    const res = await t.context.server.inject({
        method: 'GET',
        url: '/v3/users/12345678',
        headers: {
            cookie: `DW-SESSION=${session.id}`
        }
    });

    t.is(res.statusCode, 404);
});

test('Users endpoints should return products for admins', async t => {
    const admin = t.context.admin;
    const { user } = t.context.user;

    const product = await t.context.models.Product.create({
        name: 'test-product'
    });

    const userProduct = await t.context.models.UserProduct.create({
        userId: user.id,
        productId: product.id
    });

    const res = await t.context.server.inject({
        method: 'GET',
        url: `/v3/users/${user.id}`,
        headers: {
            cookie: `DW-SESSION=${admin.session.id}`
        }
    });

    t.is(res.statusCode, 200);
    t.deepEqual(res.result.products, [
        {
            id: product.id,
            name: product.name,
            url: `/v3/products/${product.id}`
        }
    ]);

    /* cleanup db entries */
    await userProduct.destroy();
    await product.destroy();
});

test('Admin can sort users by creation date - Ascending', async t => {
    const { session } = t.context.admin;

    const res = await t.context.server.inject({
        method: 'GET',
        url: '/v3/users?orderBy=createdAt&order=ASC',
        headers: {
            cookie: `DW-SESSION=${session.id}`
        }
    });

    const sortedDates = sortBy(res.result.list.map(d => d.createdAt));
    t.is(res.statusCode, 200);
    t.deepEqual(
        res.result.list.map(d => d.createdAt),
        sortedDates
    );
});

test('Admin can sort users by creation date - Descending', async t => {
    const { session } = t.context.admin;

    const res = await t.context.server.inject({
        method: 'GET',
        url: '/v3/users?orderBy=createdAt&order=DESC',
        headers: {
            cookie: `DW-SESSION=${session.id}`
        }
    });

    const sortedDates = sortBy(res.result.list.map(d => d.createdAt));
    sortedDates.reverse();

    t.is(res.statusCode, 200);
    t.deepEqual(
        res.result.list.map(d => d.createdAt),
        sortedDates
    );
});

test('Admin can sort users by chart count - Ascending', async t => {
    const { session } = t.context.admin;

    const res = await t.context.server.inject({
        method: 'GET',
        url: '/v3/users?orderBy=chartCount&order=ASC',
        headers: {
            cookie: `DW-SESSION=${session.id}`
        }
    });

    const sortedChartCount = sortBy(res.result.list.map(d => d.chartCount));
    t.is(res.statusCode, 200);
    t.deepEqual(
        res.result.list.map(d => d.chartCount),
        sortedChartCount
    );
});

test('Admin can sort users by chart count - Descending', async t => {
    const { session } = await t.context.getUser('admin');

    const res = await t.context.server.inject({
        method: 'GET',
        url: '/v3/users?orderBy=chartCount&order=DESC',
        headers: {
            cookie: `DW-SESSION=${session.id}`
        }
    });

    const sortedChartCount = sortBy(res.result.list.map(d => d.chartCount));
    sortedChartCount.reverse();

    t.is(res.statusCode, 200);
    t.deepEqual(
        res.result.list.map(d => d.chartCount),
        sortedChartCount
    );
});

test('Users endpoint searches in name field', async t => {
    const search = 'name-test';
    const { session } = t.context.admin;

    const res = await t.context.server.inject({
        method: 'GET',
        url: `/v3/users?search=${search}`,
        headers: {
            cookie: `DW-SESSION=${session.id}`
        }
    });

    const user = res.result.list.find(u => u.name.includes(search));
    t.is(res.statusCode, 200);
    t.truthy(user);
    t.true(user.name.includes(search));
    t.false(user.email.includes(search));
});

test('Users endpoint searches in email field', async t => {
    const search = '@ava';
    const { session } = t.context.admin;

    const res = await t.context.server.inject({
        method: 'GET',
        url: `/v3/users?search=${search}`,
        headers: {
            cookie: `DW-SESSION=${session.id}`
        }
    });

    const user = res.result.list.find(u => u.email.includes(search));
    const name = user.name || '';
    t.is(res.statusCode, 200);
    t.truthy(user);
    t.true(user.email.includes(search));
    t.false(name.includes(search));
});

test('/v3/users/:id/setup creates token, token can later be emptied', async t => {
    let [admin, { user }] = await Promise.all([t.context.getUser('admin'), t.context.getUser()]);

    let res = await t.context.server.inject({
        method: 'POST',
        url: `/v3/users/${user.id}/setup`,
        headers: {
            cookie: `DW-SESSION=${admin.session.id}`
        }
    });

    user = await user.reload();
    t.is(res.result.token, user.dataValues.activate_token);
    t.is(user.dataValues.pwd, '');

    res = await t.context.server.inject({
        method: 'PATCH',
        url: `/v3/users/${user.id}`,
        headers: {
            cookie: `DW-SESSION=${admin.session.id}`
        },
        payload: {
            activateToken: null
        }
    });

    user = await user.reload();
    t.is(null, user.dataValues.activate_token);
});

test('Admin can set activeTeam for users', async t => {
    const admin = t.context.admin;
    const { team, user } = await t.context.getTeamWithUser();

    const res1 = await t.context.server.inject({
        method: 'PATCH',
        url: `/v3/users/${user.id}/settings`,
        headers: {
            cookie: `DW-SESSION=${admin.session.id}`
        },
        payload: {
            activeTeam: team.id
        }
    });

    t.is(res1.statusCode, 200);
    t.is(res1.result.activeTeam, team.id);

    const res2 = await t.context.server.inject({
        method: 'PATCH',
        url: `/v3/users/${user.id}/settings`,
        headers: {
            cookie: `DW-SESSION=${admin.session.id}`
        },
        payload: {
            activeTeam: null
        }
    });

    t.is(res2.statusCode, 200);
    t.is(res2.result.activeTeam, null);

    const res3 = await t.context.server.inject({
        method: 'PATCH',
        url: `/v3/users/${user.id}/settings`,
        headers: {
            cookie: `DW-SESSION=${admin.session.id}`
        },
        payload: {
            activeTeam: 'missing-team'
        }
    });

    t.is(res3.statusCode, 404);
});

test('User can set and unset activeTeam herself', async t => {
    const { team, session } = await t.context.getTeamWithUser();

    const res1 = await t.context.server.inject({
        method: 'PATCH',
        url: '/v3/me/settings',
        headers: {
            cookie: `DW-SESSION=${session.id}`
        },
        payload: {
            activeTeam: team.id
        }
    });

    t.is(res1.statusCode, 200);
    t.is(res1.result.activeTeam, team.id);

    const res2 = await t.context.server.inject({
        method: 'PATCH',
        url: '/v3/me/settings',
        headers: {
            cookie: `DW-SESSION=${session.id}`
        },
        payload: {
            activeTeam: null
        }
    });

    t.is(res2.statusCode, 200);
    t.is(res2.result.activeTeam, null);
});

test("Users can't change protected fields using PATCH", async t => {
    let user = await t.context.getUser();

    const forbiddenFields = {
        customerId: 12345,
        oauthSignin: 'blub',
        id: 9999
    };

    let res = await t.context.server.inject({
        method: 'PATCH',
        url: `/v3/users/${user.user.id}`,
        headers: {
            cookie: `DW-SESSION=${user.session.id}`,
            'Content-Type': 'application/json'
        },
        payload: forbiddenFields
    });

    t.is(res.statusCode, 400);

    const protectedFields = {
        activateToken: '12345',
        role: 'admin'
    };

    res = await t.context.server.inject({
        method: 'PATCH',
        url: `/v3/users/${user.user.id}`,
        headers: {
            cookie: `DW-SESSION=${user.session.id}`,
            'Content-Type': 'application/json'
        },
        payload: protectedFields
    });

    t.is(res.statusCode, 200);

    user = await user.user.reload();
    for (const f in protectedFields) {
        t.not(user[decamelize(f)], protectedFields[f]);
    }
});

test('Users can change allowed fields', async t => {
    let user = await t.context.getUser();

    const allowedFields = {
        name: 'My new name',
        email: 'new@example.com'
    };

    const res = await t.context.server.inject({
        method: 'PATCH',
        url: `/v3/users/${user.user.id}`,
        headers: {
            cookie: `DW-SESSION=${user.session.id}`,
            'Content-Type': 'application/json'
        },
        payload: allowedFields
    });

    t.is(res.statusCode, 200);

    user = await user.user.reload();
    for (const f in allowedFields) {
        t.is(user[decamelize(f)], allowedFields[f]);
    }
});

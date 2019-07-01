import test from 'ava';
import nanoid from 'nanoid';
import sortBy from 'lodash/sortBy';

import { setup } from '../../test/helpers/setup';

test.before(async t => {
    const { server, models, getUser, getTeamWithUser } = await setup({ usePlugins: false });
    t.context.server = server;

    const { User, Product, UserProduct } = models;
    t.context.User = User;
    t.context.Product = Product;
    t.context.UserProduct = UserProduct;
    t.context.deleteUserFromDB = async email => {
        await User.destroy({
            where: { email },
            attributes: ['id']
        });
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
    const { user, session } = await t.context.getUser('admin');

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
});

test('Users endpoints should return 404 if no user was found', async t => {
    const { user, session } = await t.context.getUser('admin');
    const res = await t.context.server.inject({
        method: 'GET',
        url: '/v3/users/12345678',
        auth: {
            strategy: 'session',
            credentials: session,
            artifacts: user
        }
    });

    t.is(res.statusCode, 404);
});

test('Users endpoints should return products for admins', async t => {
    const [admin, { user }] = await Promise.all([t.context.getUser('admin'), t.context.getUser()]);
    const product = await t.context.Product.create({
        name: 'test-product'
    });

    const userProduct = await t.context.UserProduct.create({
        userId: user.id,
        productId: product.id
    });

    const res = await t.context.server.inject({
        method: 'GET',
        url: `/v3/users/${user.id}`,
        auth: {
            strategy: 'session',
            credentials: admin.session,
            artifacts: admin.user
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
    const admin = await t.context.getUser('admin');

    const res = await t.context.server.inject({
        method: 'GET',
        url: '/v3/users?orderBy=createdAt&order=ASC',
        auth: {
            strategy: 'session',
            credentials: admin.session,
            artifacts: admin.user
        }
    });

    const sortedDates = sortBy(res.result.list.map(d => d.createdAt));
    t.is(res.statusCode, 200);
    t.deepEqual(res.result.list.map(d => d.createdAt), sortedDates);
});

test('Admin can sort users by creation date - Descending', async t => {
    const admin = await t.context.getUser('admin');

    const res = await t.context.server.inject({
        method: 'GET',
        url: '/v3/users?orderBy=createdAt&order=DESC',
        auth: {
            strategy: 'session',
            credentials: admin.session,
            artifacts: admin.user
        }
    });

    const sortedDates = sortBy(res.result.list.map(d => d.createdAt));
    sortedDates.reverse();

    t.is(res.statusCode, 200);
    t.deepEqual(res.result.list.map(d => d.createdAt), sortedDates);
});

test('Admin can sort users by chart count - Ascending', async t => {
    const admin = await t.context.getUser('admin');

    const res = await t.context.server.inject({
        method: 'GET',
        url: '/v3/users?orderBy=chartCount&order=ASC',
        auth: {
            strategy: 'session',
            credentials: admin.session,
            artifacts: admin.user
        }
    });

    const sortedChartCount = sortBy(res.result.list.map(d => d.chartCount));
    t.is(res.statusCode, 200);
    t.deepEqual(res.result.list.map(d => d.chartCount), sortedChartCount);
});

test('Admin can sort users by chart count - Descending', async t => {
    const admin = await t.context.getUser('admin');

    const res = await t.context.server.inject({
        method: 'GET',
        url: '/v3/users?orderBy=chartCount&order=DESC',
        auth: {
            strategy: 'session',
            credentials: admin.session,
            artifacts: admin.user
        }
    });

    const sortedChartCount = sortBy(res.result.list.map(d => d.chartCount));
    sortedChartCount.reverse();

    t.is(res.statusCode, 200);
    t.deepEqual(res.result.list.map(d => d.chartCount), sortedChartCount);
});

test('Users endpoint searches in name field', async t => {
    const search = 'editor';
    const admin = await t.context.getUser('admin');

    const res = await t.context.server.inject({
        method: 'GET',
        url: `/v3/users?search=${search}`,
        auth: {
            strategy: 'session',
            credentials: admin.session,
            artifacts: admin.user
        }
    });

    const user = res.result.list.find(u => u.name.includes(search));
    t.is(res.statusCode, 200);
    t.truthy(user);
    t.true(user.name.includes(search));
    t.false(user.email.includes(search));
});

test('Users endpoint searches in email field', async t => {
    const search = '@datawrapper';
    const admin = await t.context.getUser('admin');

    const res = await t.context.server.inject({
        method: 'GET',
        url: `/v3/users?search=${search}`,
        auth: {
            strategy: 'session',
            credentials: admin.session,
            artifacts: admin.user
        }
    });

    const user = res.result.list.find(u => u.email.includes(search));
    const name = user.name || '';
    t.is(res.statusCode, 200);
    t.truthy(user);
    t.true(user.email.includes(search));
    t.false(name.includes(search));
});

test('/v3/users/:id/setup creates token', async t => {
    let [admin, { user }] = await Promise.all([t.context.getUser('admin'), t.context.getUser()]);

    const res = await t.context.server.inject({
        method: 'POST',
        url: `/v3/users/${user.id}/setup`,
        auth: {
            strategy: 'session',
            credentials: admin.session,
            artifacts: admin.user
        }
    });

    user = await user.reload();
    t.is(res.result.token, user.dataValues.activate_token);
    t.is(user.dataValues.pwd, '');
});

const test = require('ava');
const { decamelize } = require('humps');

const { setup } = require('../../../../test/helpers/setup');

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
            cookie: `DW-SESSION=${user.session.id}; crumb=abc`,
            'X-CSRF-Token': 'abc',
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
            cookie: `DW-SESSION=${user.session.id}; crumb=abc`,
            'X-CSRF-Token': 'abc',
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
    let { user, session } = await t.context.getUser();

    const oldEmail = user.email;

    const allowedFields = {
        name: 'My new name',
        email: t.context.getCredentials().email,
        language: 'de_DE'
    };

    const res = await t.context.server.inject({
        method: 'PATCH',
        url: `/v3/users/${user.id}`,
        headers: {
            cookie: `DW-SESSION=${session.id}; crumb=abc`,
            'X-CSRF-Token': 'abc',
            'Content-Type': 'application/json'
        },
        payload: allowedFields
    });

    t.is(res.statusCode, 200);

    user = await user.reload();

    const action = await t.context.models.Action.findOne({
        where: {
            user_id: user.id
        }
    });

    const details = JSON.parse(action.details);

    t.is(details['old-email'], oldEmail);
    t.is(details['new-email'], allowedFields.email);
    t.truthy(details.token);
    t.is(user.name, allowedFields.name);
    t.is(user.language, allowedFields.language);
});

test('User cannot change email if it already exists', async t => {
    const { user: user1, session } = await t.context.getUser();
    const { user: user2 } = await t.context.getUser();

    const { result, statusCode } = await t.context.server.inject({
        method: 'PATCH',
        url: `/v3/users/${user1.id}`,
        headers: {
            cookie: `DW-SESSION=${session.id}; crumb=abc`,
            'X-CSRF-Token': 'abc',
            'Content-Type': 'application/json'
        },
        payload: {
            email: user2.email
        }
    });

    t.is(statusCode, 409);
    t.is(result.message, 'email-already-exists');
});

const test = require('ava');
const { decamelize } = require('humps');
const {
    createTeamWithUser,
    createUser,
    destroy,
    getCredentials,
    setup
} = require('../../../../test/helpers/setup');

test.before(async t => {
    t.context.server = await setup({ usePlugins: false });
    t.context.userObj = await createUser(t.context.server);
    t.context.adminObj = await createUser(t.context.server, 'admin');
});

test.after.always(async t => {
    await destroy(...Object.values(t.context.userObj), ...Object.values(t.context.adminObj));
});

test('GET /users/:id - should include teams when fetched as admin', async t => {
    /* create admin user to fetch different user with team */
    const { session } = t.context.adminObj;

    let teamObj;
    try {
        /* create a team with user to fetch */
        teamObj = await createTeamWithUser(t.context.server);

        const res = await t.context.server.inject({
            method: 'GET',
            url: `/v3/users/${teamObj.user.id}`,
            headers: {
                cookie: `DW-SESSION=${session.id}`
            }
        });

        t.is(res.result.teams.length, 1);
        t.is(res.result.teams[0].id, teamObj.team.id);
        t.is(res.result.teams[0].name, teamObj.team.name);
        t.is(res.result.teams[0].url, `/v3/teams/${teamObj.team.id}`);
    } finally {
        if (teamObj) {
            await destroy(...Object.values(teamObj));
        }
    }
});

test('Users endpoints should return 404 if no user was found', async t => {
    const { session } = t.context.adminObj;
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
    const { Product, UserProduct } = require('@datawrapper/orm/models');
    let product;
    let userProduct;
    try {
        const admin = t.context.adminObj;
        const { user } = t.context.userObj;

        product = await Product.create({
            name: 'test-product'
        });

        userProduct = await UserProduct.create({
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
    } finally {
        destroy(userProduct, product);
    }
});

test("Users can't change protected fields using PATCH", async t => {
    let userObj;
    try {
        userObj = await createUser(t.context.server);
        let { user, session } = userObj;

        const forbiddenFields = {
            customerId: 12345,
            oauthSignin: 'blub',
            id: 9999
        };

        let res = await t.context.server.inject({
            method: 'PATCH',
            url: `/v3/users/${user.id}`,
            headers: {
                cookie: `DW-SESSION=${session.id}; crumb=abc`,
                'X-CSRF-Token': 'abc',
                referer: 'http://localhost',
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
            url: `/v3/users/${user.id}`,
            headers: {
                cookie: `DW-SESSION=${session.id}; crumb=abc`,
                'X-CSRF-Token': 'abc',
                referer: 'http://localhost',
                'Content-Type': 'application/json'
            },
            payload: protectedFields
        });

        t.is(res.statusCode, 200);

        user = await user.reload();
        for (const f in protectedFields) {
            t.not(user[decamelize(f)], protectedFields[f]);
        }
    } finally {
        if (userObj) {
            await destroy(...Object.values(userObj));
        }
    }
});

test('Users can change allowed fields', async t => {
    const { Action } = require('@datawrapper/orm/models');
    let userObj;
    try {
        userObj = await createUser(t.context.server);
        let { user, session } = userObj;

        const oldEmail = user.email;

        const allowedFields = {
            name: 'My new name',
            email: getCredentials().email,
            language: 'de_DE'
        };

        const res = await t.context.server.inject({
            method: 'PATCH',
            url: `/v3/users/${user.id}`,
            headers: {
                cookie: `DW-SESSION=${session.id}; crumb=abc`,
                'X-CSRF-Token': 'abc',
                referer: 'http://localhost',
                'Content-Type': 'application/json'
            },
            payload: allowedFields
        });

        t.is(res.statusCode, 200);

        user = await user.reload();

        const action = await Action.findOne({
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
    } finally {
        if (userObj) {
            await destroy(...Object.values(userObj));
        }
    }
});

test('User cannot change email if it already exists', async t => {
    let userObj1;
    let userObj2;
    try {
        userObj1 = await createUser(t.context.server);
        const { user: user1, session } = userObj1;
        userObj2 = await createUser(t.context.server);
        const { user: user2 } = userObj2;

        const { result, statusCode } = await t.context.server.inject({
            method: 'PATCH',
            url: `/v3/users/${user1.id}`,
            headers: {
                cookie: `DW-SESSION=${session.id}; crumb=abc`,
                'X-CSRF-Token': 'abc',
                referer: 'http://localhost',
                'Content-Type': 'application/json'
            },
            payload: {
                email: user2.email
            }
        });

        t.is(statusCode, 409);
        t.is(result.message, 'email-already-exists');
    } finally {
        if (userObj1) {
            await destroy(...Object.values(userObj1));
        }
        if (userObj2) {
            await destroy(...Object.values(userObj2));
        }
    }
});

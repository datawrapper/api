const test = require('ava');

const { setup } = require('../../../test/helpers/setup');

test.before(async t => {
    const { server, models, getUser, getTeamWithUser } = await setup({
        usePlugins: false
    });
    t.context.server = server;

    t.context.legacyHash = require('../../auth/utils').legacyHash;

    t.context.user = await getUser();
    t.context.models = models;

    t.context.getUser = getUser;
    t.context.getTeamWithUser = getTeamWithUser;
});

test('User cannot change password without old password', async t => {
    const { legacyHash, server, user: contextUser } = t.context;
    const { authSalt, secretAuthSalt } = server.methods.config('api');
    const { session, user } = contextUser;

    const patchMe = async payload =>
        t.context.server.inject({
            method: 'PATCH',
            url: '/v3/me',
            headers: {
                cookie: `DW-SESSION=${session.id}`
            },
            payload
        });

    const oldPwdHash = user.pwd;
    // try to change without password
    let res = await patchMe({ password: 'new-password' });
    t.is(res.statusCode, 401);

    // check that password hash is still the same
    await user.reload();
    t.is(user.pwd, oldPwdHash);

    // try to change with false password
    res = await patchMe({ password: 'new-password', oldPassword: 'I dont know' });
    t.is(res.statusCode, 401);

    // check that password hash is still the same
    await user.reload();
    t.is(user.pwd, oldPwdHash);

    // try to change with correct password
    res = await patchMe({ password: 'new-password', oldPassword: 'test-password' });
    t.is(res.statusCode, 200);

    // check that password hash is still the same
    await user.reload();
    t.not(user.pwd, oldPwdHash);

    // try the same with legacy login (tests have secret salt configured)
    let legacyPwd = legacyHash('legacy-password', authSalt);
    if (secretAuthSalt) legacyPwd = legacyHash(legacyPwd, secretAuthSalt);
    await user.update({ pwd: legacyPwd });

    // test is changing password also works with legacy hashes
    res = await patchMe({
        password: 'new-password',
        oldPassword: 'wrong-legacy-password'
    });
    t.is(res.statusCode, 401);

    res = await patchMe({ password: 'new-password', oldPassword: 'legacy-password' });
    t.is(res.statusCode, 200);
});

test('User can delete their account and are logged out', async t => {
    const { user, session } = await t.context.getUser();

    const res1 = await t.context.server.inject({
        method: 'DELETE',
        url: '/v3/me',
        headers: {
            cookie: `DW-SESSION=${session.id}`
        },
        payload: {
            email: user.email,
            password: 'test-password'
        }
    });

    t.is(res1.statusCode, 204);

    const res2 = await t.context.server.inject({
        method: 'GET',
        url: '/v3/me',
        headers: {
            cookie: `DW-SESSION=${session.id}`
        }
    });

    t.is(res2.statusCode, 401);
});

test('User cannot delete their account while owning team', async t => {
    const { user, team, session } = await t.context.getTeamWithUser('owner');

    const res1 = await t.context.server.inject({
        method: 'DELETE',
        url: '/v3/me',
        headers: {
            cookie: `DW-SESSION=${session.id}`
        },
        payload: {
            email: user.email,
            password: 'test-password'
        }
    });

    t.is(res1.statusCode, 409);

    const res2 = await t.context.server.inject({
        method: 'DELETE',
        url: `/v3/teams/${team.id}`,
        headers: {
            cookie: `DW-SESSION=${session.id}`
        }
    });

    t.is(res2.statusCode, 204);

    const res3 = await t.context.server.inject({
        method: 'DELETE',
        url: '/v3/me',
        headers: {
            cookie: `DW-SESSION=${session.id}`
        },
        payload: {
            email: user.email,
            password: 'test-password'
        }
    });

    t.is(res3.statusCode, 204);
});

test('User can delete their account if only admin of a team', async t => {
    const { user, session } = await t.context.getTeamWithUser('admin');

    const res = await t.context.server.inject({
        method: 'DELETE',
        url: '/v3/me',
        headers: {
            cookie: `DW-SESSION=${session.id}`
        },
        payload: {
            email: user.email,
            password: 'test-password'
        }
    });

    t.is(res.statusCode, 204);
});

test('Request is accepted when Origin header matches frontend host', async t => {
    const { session } = await t.context.getTeamWithUser('admin');

    const res = await t.context.server.inject({
        method: 'GET',
        url: `/v3/me`,
        headers: {
            cookie: `DW-SESSION=${session.id}`,
            Origin: 'http://localhost'
        }
    });

    t.is(res.statusCode, 200);
});

test("Request is rejected when Origin header doesn't match frontend host", async t => {
    const { session } = await t.context.getTeamWithUser('admin');

    const res = await t.context.server.inject({
        method: 'GET',
        url: `/v3/me`,
        headers: {
            cookie: `DW-SESSION=${session.id}`,
            Origin: 'spam'
        }
    });

    t.is(res.statusCode, 400);
});

test('Request is accepted when Origin header is empty', async t => {
    const { session } = await t.context.getTeamWithUser('admin');

    const res = await t.context.server.inject({
        method: 'GET',
        url: `/v3/me`,
        headers: {
            cookie: `DW-SESSION=${session.id}`,
            Origin: ''
        }
    });

    t.is(res.statusCode, 200);
});

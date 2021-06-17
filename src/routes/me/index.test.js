const test = require('ava');
const { createTeamWithUser, createUser, destroy, setup } = require('../../../test/helpers/setup');

test.before(async t => {
    t.context.server = await setup({ usePlugins: false });
    t.context.legacyHash = require('@datawrapper/service-utils/auth')(
        require('@datawrapper/orm')
    ).legacyHash;
    t.context.userObj = await createUser(t.context.server);
});

test.after.always(async t => {
    await destroy(...Object.values(t.context.userObj));
});

test('User cannot change password without old password', async t => {
    const { legacyHash, server, userObj } = t.context;
    const { authSalt, secretAuthSalt } = server.methods.config('api');
    const { session, user } = userObj;

    const patchMe = async payload =>
        t.context.server.inject({
            method: 'PATCH',
            url: '/v3/me',
            headers: {
                cookie: `DW-SESSION=${session.id}; crumb=abc`,
                'X-CSRF-Token': 'abc',
                referer: 'http://localhost'
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
    let userObj;
    try {
        userObj = await createUser(t.context.server);
        const { user, session } = userObj;

        const res1 = await t.context.server.inject({
            method: 'DELETE',
            url: '/v3/me',
            headers: {
                cookie: `DW-SESSION=${session.id}; crumb=abc`,
                'X-CSRF-Token': 'abc',
                referer: 'http://localhost'
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
    } finally {
        if (userObj) {
            await destroy(...Object.values(userObj));
        }
    }
});

test('User cannot delete their account while owning team', async t => {
    let teamObj;
    try {
        teamObj = await createTeamWithUser(t.context.server, 'owner');
        const { user, team, session } = teamObj;

        const res1 = await t.context.server.inject({
            method: 'DELETE',
            url: '/v3/me',
            headers: {
                cookie: `DW-SESSION=${session.id}; crumb=abc`,
                'X-CSRF-Token': 'abc',
                referer: 'http://localhost'
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
                cookie: `DW-SESSION=${session.id}; crumb=abc`,
                'X-CSRF-Token': 'abc',
                referer: 'http://localhost'
            }
        });

        t.is(res2.statusCode, 204);

        const res3 = await t.context.server.inject({
            method: 'DELETE',
            url: '/v3/me',
            headers: {
                cookie: `DW-SESSION=${session.id}; crumb=abc`,
                'X-CSRF-Token': 'abc',
                referer: 'http://localhost'
            },
            payload: {
                email: user.email,
                password: 'test-password'
            }
        });

        t.is(res3.statusCode, 204);
    } finally {
        if (teamObj) {
            await destroy(...Object.values(teamObj));
        }
    }
});

test('User can delete their account if only admin of a team', async t => {
    let teamObj;
    try {
        teamObj = await createTeamWithUser(t.context.server, 'admin');
        const { user, session } = teamObj;

        const res = await t.context.server.inject({
            method: 'DELETE',
            url: '/v3/me',
            headers: {
                cookie: `DW-SESSION=${session.id}; crumb=abc`,
                'X-CSRF-Token': 'abc',
                referer: 'http://localhost'
            },
            payload: {
                email: user.email,
                password: 'test-password'
            }
        });

        t.is(res.statusCode, 204);
    } finally {
        if (teamObj) {
            await destroy(...Object.values(teamObj));
        }
    }
});

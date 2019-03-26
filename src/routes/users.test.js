import test from 'ava';
import nanoid from 'nanoid';

import { init } from '../server';

test.before(async t => {
    t.context.server = await init({ usePlugins: false });

    /* remove when DELETE /users/:id exists w */
    const { User } = require('@datawrapper/orm/models');
    t.context.User = User;
});

test('Users - It should be possible to create a user, login and logout', async t => {
    const credentials = {
        email: `test-${nanoid(5)}@ava.js`,
        password: 'strong-secure-password'
    };

    /* create user with email and some data */
    let res = await t.context.server.inject({
        method: 'POST',
        url: '/v3/users',
        payload: { ...credentials, language: 'de-DE' }
    });

    t.is(res.statusCode, 201);
    t.is(res.result.email, credentials.email);
    t.is(res.result.language, 'de-DE');

    /* login as newly created user */
    res = await t.context.server.inject({
        method: 'POST',
        url: '/v3/auth/login',
        payload: credentials
    });

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

    t.is(res.statusCode, 205);
    t.false(res.headers['set-cookie'].join().includes(cookieString));
    t.is(res.headers[('clear-site-data', '"cookies", "storage", "executionContexts"')]);

    /* start - replace with DELETE endpoint in the future */
    const user = await t.context.User.findOne({
        where: { email: credentials.email },
        attributes: ['id']
    });

    user.destroy();
    /* end */
});

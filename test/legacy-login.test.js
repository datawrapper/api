import test from 'ava';
import nanoid from 'nanoid';
import { Op } from 'sequelize';

import { setup } from './helpers/setup';

test.before(async t => {
    const { server, models } = await setup({ usePlugins: false });
    t.context.server = server;
    t.context.users = [];
    t.context.userIds = [];

    const { User, Session } = models;
    t.context.UserModel = User;
    t.context.SessionModel = Session;
});

test.beforeEach(async t => {
    t.context.id = nanoid(5);
    t.context.userEmail = `legacy-login-${t.context.id}@test.de`;

    t.context.user = await t.context.UserModel.create({
        email: t.context.userEmail,
        pwd: 'fe2cbb87381c35e2ad4081d9dd23e2e160d7e2995a8d1110bdba1c4e2720704c',
        role: 'editor'
    });

    t.context.userEmail = `legacy-login-${t.context.id}@test.de`;
});

test.afterEach.always(async t => {
    t.context.users.push(t.context.userEmail);
    t.context.userIds.push(t.context.user.id);
});

test.after.always(async t => {
    const deletedUsers = await t.context.UserModel.destroy({
        where: {
            email: { [Op.or]: t.context.users }
        }
    });

    const deletedSessions = await t.context.SessionModel.destroy({
        where: {
            data: {
                [Op.or]: t.context.userIds.map(id => ({ [Op.like]: `dw-user-id|i:${id}%` }))
            }
        }
    });

    t.log('Users cleaned up:', deletedUsers);
    t.log('Sessions cleaned up:', deletedSessions);
});

test.skip('Client hashed password', async t => {
    const res = await t.context.server.inject({
        method: 'POST',
        url: '/v3/auth/login',
        payload: {
            email: t.context.userEmail,
            password: 'ac6569a68bf6697a1f6072cc9f30e061ed41a234d12f824099ba84294233a855'
        }
    });

    t.truthy(res.result['DW-SESSION']);
    t.is(res.statusCode, 200);
});

test.skip('Non hashed password', async t => {
    const res = await t.context.server.inject({
        method: 'POST',
        url: '/v3/auth/login',
        payload: {
            email: t.context.userEmail,
            password: 'legacy'
        }
    });

    t.truthy(res.result['DW-SESSION']);
    t.is(res.statusCode, 200);
});

test.skip('Migrate client hashed password to new hash', async t => {
    let res = await t.context.server.inject({
        method: 'POST',
        url: '/v3/auth/login',
        payload: {
            email: t.context.userEmail,
            password: 'ac6569a68bf6697a1f6072cc9f30e061ed41a234d12f824099ba84294233a855'
        }
    });

    t.truthy(res.result['DW-SESSION']);
    t.is(res.statusCode, 200);

    res = await t.context.server.inject({
        method: 'POST',
        url: '/v3/auth/login',
        payload: {
            email: t.context.userEmail,
            password: 'legacy'
        }
    });

    t.truthy(res.result['DW-SESSION']);
    t.is(res.statusCode, 200);
});

test.skip('Migrate password to new hash', async t => {
    let res = await t.context.server.inject({
        method: 'POST',
        url: '/v3/auth/login',
        payload: {
            email: t.context.userEmail,
            password: 'legacy'
        }
    });

    t.truthy(res.result['DW-SESSION']);
    t.is(res.statusCode, 200);

    res = await t.context.server.inject({
        method: 'POST',
        url: '/v3/auth/login',
        payload: {
            email: t.context.userEmail,
            password: 'legacy'
        }
    });

    t.truthy(res.result['DW-SESSION']);
    t.is(res.statusCode, 200);
});

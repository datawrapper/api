import test from 'ava';
import { init } from '../server';

const userCredentials = {
    email: 'test-chart@test.de',
    password: 'test'
};

test.before(async t => {
    t.context.server = await init({ usePlugins: false });

    const { User, Session, Chart } = require('@datawrapper/orm/models');
    t.context.UserModel = User;
    t.context.SessionModel = Session;
    t.context.ChartModel = Chart;
    const user = await t.context.server.inject({
        method: 'POST',
        url: '/v3/users',
        payload: userCredentials
    });

    const session = await t.context.server.inject({
        method: 'POST',
        url: '/v3/auth/login',
        payload: userCredentials
    });

    t.context.session = session.result['DW-SESSION'];
    t.context.user = user.result;
});

test.after.always(async t => {
    await t.context.ChartModel.destroy({
        where: { author_id: t.context.user.id }
    });

    await t.context.UserModel.destroy({
        where: { email: userCredentials.email }
    });

    await t.context.SessionModel.destroy({
        where: { session_id: t.context.session }
    });
});

test('It should be possible to create, fetch and delete charts', async t => {
    let chart = await t.context.server.inject({
        method: 'POST',
        url: '/v3/charts',
        auth: {
            strategy: 'session',
            credentials: t.context.session,
            artifacts: t.context.user
        }
    });

    t.truthy(chart.result.authorId);
    t.is(chart.result.id.length, 5);
    t.is(typeof chart.result.metadata, 'object');

    chart = await t.context.server.inject({
        method: 'GET',
        url: `/v3/charts/${chart.result.id}?metadataFormat=string`,
        auth: {
            strategy: 'session',
            credentials: t.context.session,
            artifacts: t.context.user
        }
    });

    t.truthy(chart.result.authorId);
    t.is(chart.result.id.length, 5);
    t.is(typeof chart.result.metadata, 'string');

    chart = await t.context.server.inject({
        method: 'DELETE',
        url: `/v3/charts/${chart.result.id}`,
        auth: {
            strategy: 'session',
            credentials: t.context.session,
            artifacts: t.context.user
        }
    });

    t.is(chart.statusCode, 204);
});

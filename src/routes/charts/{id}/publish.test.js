const test = require('ava');
const { setup } = require('../../../../test/helpers/setup');

test.before(async t => {
    const { server, getUser } = await setup({ usePlugins: false });
    const data = await getUser('admin');

    t.context.server = server;
    t.context.data = data;
    t.context.getUser = getUser;
    t.context.auth = {
        strategy: 'session',
        credentials: data.session,
        artifacts: data.user
    };
    t.context.headers = {
        cookie: 'crumb=abc',
        'X-CSRF-Token': 'abc',
        referer: 'http://localhost'
    };
    const resChart = await t.context.server.inject({
        method: 'POST',
        url: '/v3/charts',
        auth: t.context.auth,
        headers: t.context.headers,
        payload: {
            metadata: {
                foo: 'Unpublished chart'
            }
        }
    });
    t.context.chart = resChart.result;

    const resPublicChart = await t.context.server.inject({
        method: 'POST',
        url: '/v3/charts',
        auth: t.context.auth,
        headers: t.context.headers,
        payload: {
            metadata: {
                foo: 'Published version'
            }
        }
    });
    t.context.publicChart = resPublicChart.result;

    await t.context.server.inject({
        method: 'POST',
        url: `/v3/charts/${t.context.publicChart.id}/publish`,
        auth: t.context.auth,
        headers: t.context.headers
    });
    await t.context.server.inject({
        method: 'PUT',
        url: `/v3/charts/${t.context.publicChart.id}`,
        auth: t.context.auth,
        headers: t.context.headers,
        payload: {
            metadata: {
                foo: 'New version'
            }
        }
    });
});

test('GET /charts/{id}/publish/data returns the latest data of an unpublished chart', async t => {
    const { chart } = t.context;
    const res = await t.context.server.inject({
        method: 'GET',
        url: `/v3/charts/${chart.id}/publish/data`,
        auth: t.context.auth,
        headers: t.context.headers
    });
    t.is(res.statusCode, 200);
    t.is(res.result.chart.metadata.foo, 'Unpublished chart');
});

test('GET /charts/{id}/publish/data returns the latest data of a published chart', async t => {
    const { publicChart } = t.context;
    const res = await t.context.server.inject({
        method: 'GET',
        url: `/v3/charts/${publicChart.id}/publish/data`,
        auth: t.context.auth,
        headers: t.context.headers
    });
    t.is(res.statusCode, 200);
    t.is(res.result.chart.metadata.foo, 'New version');
});

test('GET /charts/{id}/publish/data returns the last published data when published=true', async t => {
    const { publicChart } = t.context;
    const res = await t.context.server.inject({
        method: 'GET',
        url: `/v3/charts/${publicChart.id}/publish/data?published=true`,
        auth: t.context.auth,
        headers: t.context.headers
    });
    t.is(res.statusCode, 200);
    t.is(res.result.chart.metadata.foo, 'Published version');
});

test('GET /charts/{id}/publish/data returns 404 for unpublished chart when published=true', async t => {
    const { chart } = t.context;
    const res = await t.context.server.inject({
        method: 'GET',
        url: `/v3/charts/${chart.id}/publish/data?published=true`,
        auth: t.context.auth,
        headers: t.context.headers
    });
    t.is(res.statusCode, 404);
});

test('GET /charts/{id}/publish/data returns 401 for unpublished chart when requested as another user', async t => {
    const { chart } = t.context;
    const { session } = await t.context.getUser();
    const res = await t.context.server.inject({
        method: 'GET',
        url: `/v3/charts/${chart.id}/publish/data`,
        headers: {
            cookie: `DW-SESSION=${session.id}; crumb=abc`
        }
    });
    t.is(res.statusCode, 401);
});

test('GET /charts/{id}/publish/data returns the data when requested as another user with ott', async t => {
    const { chart } = t.context;
    const { ChartAccessToken } = require('@datawrapper/orm/models');
    const token = 'test-token';
    await ChartAccessToken.create({
        chart_id: chart.id,
        token
    });
    const { session } = await t.context.getUser();

    const resWrong = await t.context.server.inject({
        method: 'GET',
        url: `/v3/charts/${chart.id}/publish/data?ott=spam`,
        headers: {
            cookie: `DW-SESSION=${session.id}; crumb=abc`
        }
    });
    t.is(resWrong.statusCode, 401);

    const res = await t.context.server.inject({
        method: 'GET',
        url: `/v3/charts/${chart.id}/publish/data?ott=${token}`,
        headers: {
            cookie: `DW-SESSION=${session.id}; crumb=abc`
        }
    });
    t.is(res.statusCode, 200);
    t.is(res.result.chart.metadata.foo, 'Unpublished chart');
});

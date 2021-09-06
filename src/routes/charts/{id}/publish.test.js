const test = require('ava');
const { createUser, destroy, setup } = require('../../../../test/helpers/setup');

test.before(async t => {
    t.context.server = await setup({ usePlugins: false });
    t.context.userObj = await createUser(t.context.server, 'admin');
    t.context.auth = {
        strategy: 'session',
        credentials: t.context.userObj.session,
        artifacts: t.context.userObj.user
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

test.after.always(async t => {
    await destroy(...Object.values(t.context.userObj), t.context.publicChart, t.context.chart);
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
    let userObj;
    try {
        userObj = await createUser(t.context.server);
        const { session } = userObj;
        const res = await t.context.server.inject({
            method: 'GET',
            url: `/v3/charts/${chart.id}/publish/data`,
            headers: {
                cookie: `DW-SESSION=${session.id}; crumb=abc`
            }
        });
        t.is(res.statusCode, 401);
    } finally {
        if (userObj) {
            await destroy(...Object.values(userObj));
        }
    }
});

test('GET /charts/{id}/publish/data returns the data when requested as another user with ott', async t => {
    const { chart } = t.context;
    const { ChartAccessToken } = require('@datawrapper/orm/models');
    const token = 'test-token';
    await ChartAccessToken.create({
        chart_id: chart.id,
        token
    });
    let userObj;
    try {
        userObj = await createUser(t.context.server);
        const { session } = userObj;

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
    } finally {
        if (userObj) {
            await destroy(...Object.values(userObj));
        }
    }
});

test('POST /charts/{id}/publish updates chart properties', async t => {
    const { chart } = t.context;

    const prePublicationDate = new Date();
    prePublicationDate.setMilliseconds(0);

    let res = await t.context.server.inject({
        method: 'GET',
        url: `/v3/charts/${chart.id}`,
        auth: t.context.auth,
        headers: t.context.headers
    });

    t.is(res.statusCode, 200);
    t.falsy(res.result.publicVersion);
    t.falsy(res.result.lastEditStep);
    t.falsy(res.result.publishedAt);

    res = await t.context.server.inject({
        method: 'POST',
        url: `/v3/charts/${chart.id}/publish`,
        auth: t.context.auth,
        headers: t.context.headers
    });

    t.is(res.statusCode, 200);

    res = await t.context.server.inject({
        method: 'GET',
        url: `/v3/charts/${chart.id}`,
        auth: t.context.auth,
        headers: t.context.headers
    });

    t.is(res.statusCode, 200);
    t.is(res.result.publicVersion, 1);
    t.is(res.result.lastEditStep, 5);
    t.is(new Date(res.result.publishedAt) >= prePublicationDate, true);
});

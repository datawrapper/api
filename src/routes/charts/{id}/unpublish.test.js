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
});

test.after.always(async t => {
    await destroy(...Object.values(t.context.userObj), t.context.publicChart, t.context.chart);
});

test('POST /charts/{id}/unpublish resets chart properties', async t => {
    const { chart } = t.context;

    let res = await t.context.server.inject({
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
    t.truthy(res.result.publishedAt);

    res = await t.context.server.inject({
        method: 'POST',
        url: `/v3/charts/${chart.id}/unpublish`,
        auth: t.context.auth,
        headers: t.context.headers
    });

    t.is(res.statusCode, 204);

    res = await t.context.server.inject({
        method: 'GET',
        url: `/v3/charts/${chart.id}`,
        auth: t.context.auth,
        headers: t.context.headers
    });

    t.is(res.statusCode, 200);
    t.is(res.result.publicVersion, 0);
    t.is(res.result.lastEditStep, 4);
    t.is(res.result.publishedAt, null);
});

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
});

test.after.always(async t => {
    await destroy(...Object.values(t.context.userObj));
});

test('Invalid export format returns 400', async t => {
    // create a new chart
    let res = await t.context.server.inject({
        method: 'POST',
        url: '/v3/charts',
        headers: {
            cookie: `DW-SESSION=${t.context.auth.credentials.id}; crumb=abc`,
            'X-CSRF-Token': 'abc',
            referer: 'http://localhost'
        },
        payload: {}
    });
    const chart = res.result;
    t.is(res.statusCode, 201);

    // lets get a geojson of this
    res = await t.context.server.inject({
        method: 'POST',
        url: `/v3/charts/${chart.id}/export/geojson`,
        headers: {
            cookie: `DW-SESSION=${t.context.auth.credentials.id}; crumb=abc`,
            'X-CSRF-Token': 'abc',
            referer: 'http://localhost'
        },
        payload: {}
    });

    // this should be a Bad Request
    t.is(res.statusCode, 400);
});

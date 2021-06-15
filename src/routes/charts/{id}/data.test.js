const test = require('ava');
const { createUser, destroy, setup } = require('../../../../test/helpers/setup');

async function getData(server, session, chart) {
    return server.inject({
        method: 'GET',
        headers: {
            cookie: `DW-SESSION=${session.id}`
        },
        url: `/v3/charts/${chart.id}/data`
    });
}

async function getAsset(server, session, chart, asset) {
    return server.inject({
        method: 'GET',
        headers: {
            cookie: `DW-SESSION=${session.id}`
        },
        url: `/v3/charts/${chart.id}/assets/${asset}`
    });
}

async function putData(server, session, chart, data, contentType = 'text/csv') {
    return server.inject({
        method: 'PUT',
        headers: {
            cookie: `DW-SESSION=${session.id}; crumb=abc`,
            'X-CSRF-Token': 'abc',
            referer: 'http://localhost',
            'Content-Type': contentType
        },
        url: `/v3/charts/${chart.id}/data`,
        payload: data
    });
}

async function putAsset(server, session, chart, asset, data, contentType = 'text/csv') {
    return server.inject({
        method: 'PUT',
        headers: {
            cookie: `DW-SESSION=${session.id}; crumb=abc`,
            'X-CSRF-Token': 'abc',
            referer: 'http://localhost',
            'Content-Type': contentType
        },
        url: `/v3/charts/${chart.id}/assets/${asset}`,
        payload: data
    });
}

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

test('User can read and write chart data', async t => {
    let userObj;
    try {
        userObj = await createUser(t.context.server);
        const { session } = userObj;

        // create a new chart
        let res = await t.context.server.inject({
            method: 'POST',
            url: '/v3/charts',
            headers: {
                cookie: `DW-SESSION=${session.id}; crumb=abc`,
                'X-CSRF-Token': 'abc',
                referer: 'http://localhost'
            },
            payload: {}
        });
        const chart = res.result;

        // chart data is missing by default
        res = await getData(t.context.server, session, chart);
        t.is(res.statusCode, 200);
        t.is(res.result, ' ');
        // set chart data
        res = await putData(t.context.server, session, chart, 'hello world');
        t.is(res.statusCode, 204);
        // confirm chart data was set
        res = await getData(t.context.server, session, chart);
        t.is(res.statusCode, 200);
        t.is(res.result, 'hello world');
        // check if data is written to asset, too
        res = await getAsset(t.context.server, session, chart, `${chart.id}.csv`);
        t.is(res.statusCode, 200);
        t.is(res.result, 'hello world');
        // make sure we can't access data for a different chart id
        res = await getAsset(t.context.server, session, chart, `00000.csv`);
        t.is(res.statusCode, 400);
        // write some JSON to another asset
        res = await putAsset(
            t.context.server,
            session,
            chart,
            `${chart.id}.map.json`,
            { answer: 42 },
            'application/json'
        );
        t.is(res.statusCode, 204);
        // see if that worked
        res = await getAsset(t.context.server, session, chart, `${chart.id}.map.json`);
        t.is(res.statusCode, 200);
        t.is(JSON.parse(res.result).answer, 42);
    } finally {
        if (userObj) {
            await destroy(...Object.values(userObj));
        }
    }
});

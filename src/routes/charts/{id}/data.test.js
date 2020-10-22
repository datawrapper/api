const test = require('ava');
const { setup } = require('../../../../test/helpers/setup');

test.before(async t => {
    const { server, getUser, getTeamWithUser } = await setup({ usePlugins: false });
    const data = await getUser('admin');

    t.context.server = server;
    t.context.data = data;
    t.context.getUser = getUser;
    t.context.getTeamWithUser = getTeamWithUser;
    t.context.auth = {
        strategy: 'session',
        credentials: data.session,
        artifacts: data.user
    };
});

test('User can read and write chart data', async t => {
    const { session } = await t.context.getUser();
    // create a new chart
    const chart = await t.context.server.inject({
        method: 'POST',
        url: '/v3/charts',
        headers: {
            cookie: `DW-SESSION=${session.id}; crumb=abc`,
            'X-CSRF-Token': 'abc',
            referer: 'http://localhost'
        },
        payload: {}
    });

    // chart data is missing by default
    let res = await getData();
    t.is(res.statusCode, 200);
    t.is(res.result, ' ');
    // set chart data
    res = await putData('hello world');
    t.is(res.statusCode, 204);
    // confirm chart data was set
    res = await getData();
    t.is(res.statusCode, 200);
    t.is(res.result, 'hello world');
    // check if data is written to asset, too
    res = await getAsset(`${chart.result.id}.csv`);
    t.is(res.statusCode, 200);
    t.is(res.result, 'hello world');
    // make sure we can't access data for a different chart id
    res = await getAsset(`00000.csv`);
    t.is(res.statusCode, 400);
    // write some JSON to another asset
    res = await putAsset(`${chart.result.id}.map.json`, { answer: 42 }, 'application/json');
    t.is(res.statusCode, 204);
    // see if that worked
    res = await getAsset(`${chart.result.id}.map.json`);
    t.is(res.statusCode, 200);
    t.is(JSON.parse(res.result).answer, 42);

    async function getData() {
        return t.context.server.inject({
            method: 'GET',
            headers: {
                cookie: `DW-SESSION=${session.id}`
            },
            url: `/v3/charts/${chart.result.id}/data`
        });
    }

    async function getAsset(asset) {
        return t.context.server.inject({
            method: 'GET',
            headers: {
                cookie: `DW-SESSION=${session.id}`
            },
            url: `/v3/charts/${chart.result.id}/assets/${asset}`
        });
    }

    async function putData(data, contentType = 'text/csv') {
        return t.context.server.inject({
            method: 'PUT',
            headers: {
                cookie: `DW-SESSION=${session.id}; crumb=abc`,
                'X-CSRF-Token': 'abc',
                referer: 'http://localhost',
                'Content-Type': contentType
            },
            url: `/v3/charts/${chart.result.id}/data`,
            payload: data
        });
    }

    async function putAsset(asset, data, contentType = 'text/csv') {
        return t.context.server.inject({
            method: 'PUT',
            headers: {
                cookie: `DW-SESSION=${session.id}; crumb=abc`,
                'X-CSRF-Token': 'abc',
                referer: 'http://localhost',
                'Content-Type': contentType
            },
            url: `/v3/charts/${chart.result.id}/assets/${asset}`,
            payload: data
        });
    }
});

const test = require('ava');
const { setup } = require('../../../../test/helpers/setup');

test.before(async t => {
    const { server, createTheme, getUser } = await setup({ usePlugins: false });
    await createTheme({
        id: 'default',
        data: {},
        assets: {}
    });
    const data = await getUser('admin');

    t.context.server = server;
    t.context.data = data;
    t.context.getUser = getUser;
});

test('User can write chart asset with almost 2MB', async t => {
    const { session } = await t.context.getUser();
    const headers = {
        cookie: `DW-SESSION=${session.id}; crumb=abc`,
        'X-CSRF-Token': 'abc',
        referer: 'http://localhost'
    };
    // create a new chart
    const chart = await t.context.server.inject({
        method: 'POST',
        url: '/v3/charts',
        headers,
        payload: {}
    });

    const bytes = Math.floor(1.99 * 1024 * 1024);
    let big = '';
    while (big.length < bytes) {
        big += Math.round(Math.random() * 32).toString(32);
    }

    // write some big JSON
    let res = await putAsset(`${chart.result.id}.map.json`, { data: big }, 'application/json');
    t.is(res.statusCode, 204);
    // see if that worked
    res = await getAsset(`${chart.result.id}.map.json`);
    t.is(res.statusCode, 200);
    t.is(JSON.parse(res.result).data.length, bytes);

    // try writing some oversize JSON
    res = await putAsset(`${chart.result.id}.map.json`, { data: big + big }, 'application/json');
    // that should not work
    t.is(res.statusCode, 413);

    async function getAsset(asset) {
        return t.context.server.inject({
            method: 'GET',
            headers,
            url: `/v3/charts/${chart.result.id}/assets/${asset}`
        });
    }

    async function putAsset(asset, data, contentType = 'text/csv') {
        return t.context.server.inject({
            method: 'PUT',
            headers: {
                ...headers,
                'Content-Type': contentType
            },
            url: `/v3/charts/${chart.result.id}/assets/${asset}`,
            payload: data
        });
    }
});

test('Public asset can be read', async t => {
    const { session } = await t.context.getUser();

    const headers = {
        cookie: `DW-SESSION=${session.id}; crumb=abc`,
        'X-CSRF-Token': 'abc',
        referer: 'http://localhost'
    };
    // create a new chart
    const chart = await t.context.server.inject({
        method: 'POST',
        url: '/v3/charts',
        headers,
        payload: {}
    });

    const asset = `X1,X2
10,20`;

    let res = await putAsset(`${chart.result.id}.csv`, { data: asset });
    t.is(res.statusCode, 204);

    // see if that worked
    res = await getAsset(`${chart.result.id}.csv`);
    t.is(res.statusCode, 200);
    t.is(JSON.parse(res.result).data, asset);

    // publish chart
    t.context.server.inject({
        method: 'POST',
        headers,
        url: `/v3/charts/${chart.result.id}/publish`
    });

    // unauthenticated user can read public asset
    const unauthenticatedHeaders = {
        cookie: `crumb=abc`,
        'X-CSRF-Token': 'abc',
        referer: 'http://localhost'
    };

    const publicAsset = await t.context.server.inject({
        method: 'GET',
        headers: unauthenticatedHeaders,
        url: `/v3/charts/${chart.result.id}/assets/${chart.result.id}.public.csv`
    });
    t.is(publicAsset.statusCode, 200);

    const nonPublicAsset = await t.context.server.inject({
        method: 'GET',
        headers: unauthenticatedHeaders,
        url: `/v3/charts/${chart.result.id}/assets/${chart.result.id}.csv`
    });
    t.is(nonPublicAsset.statusCode, 403);

    async function getAsset(asset) {
        return t.context.server.inject({
            method: 'GET',
            headers,
            url: `/v3/charts/${chart.result.id}/assets/${asset}`
        });
    }

    async function putAsset(asset, data, contentType = 'text/csv') {
        return t.context.server.inject({
            method: 'PUT',
            headers: {
                ...headers,
                'Content-Type': contentType
            },
            url: `/v3/charts/${chart.result.id}/assets/${asset}`,
            payload: data
        });
    }
});

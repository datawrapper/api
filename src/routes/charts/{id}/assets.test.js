const test = require('ava');
const { createUser, destroy, setup } = require('../../../../test/helpers/setup');

async function getAsset(server, headers, chart, asset) {
    return server.inject({
        method: 'GET',
        headers,
        url: `/v3/charts/${chart.id}/assets/${asset}`
    });
}

async function putAsset(server, headers, chart, asset, data, contentType = 'text/csv') {
    return server.inject({
        method: 'PUT',
        headers: {
            ...headers,
            'Content-Type': contentType
        },
        url: `/v3/charts/${chart.id}/assets/${asset}`,
        payload: data
    });
}

test.before(async t => {
    t.context.server = await setup({ usePlugins: false });
    t.context.userObj = await createUser(t.context.server, 'admin');
});

test.after.always(async t => {
    await destroy(...Object.values(t.context.userObj));
});

test('User can write chart asset with almost 2MB', async t => {
    let userObj;
    try {
        userObj = await createUser(t.context.server);
        const { session } = userObj;
        const headers = {
            cookie: `DW-SESSION=${session.id}; crumb=abc`,
            'X-CSRF-Token': 'abc',
            referer: 'http://localhost'
        };
        // create a new chart
        let res = await t.context.server.inject({
            method: 'POST',
            url: '/v3/charts',
            headers,
            payload: {}
        });
        const chart = res.result;

        const bytes = Math.floor(1.99 * 1024 * 1024);
        let big = '';
        while (big.length < bytes) {
            big += Math.round(Math.random() * 32).toString(32);
        }

        // write some big JSON
        res = await putAsset(
            t.context.server,
            headers,
            chart,
            `${chart.id}.map.json`,
            { data: big },
            'application/json'
        );
        t.is(res.statusCode, 204);
        // see if that worked
        res = await getAsset(t.context.server, headers, chart, `${chart.id}.map.json`);
        t.is(res.statusCode, 200);
        t.is(JSON.parse(res.result).data.length, bytes);

        // try writing some oversize JSON
        res = await putAsset(
            t.context.server,
            headers,
            chart,
            `${chart.id}.map.json`,
            { data: big + big },
            'application/json'
        );
        // that should not work
        t.is(res.statusCode, 413);
    } finally {
        if (userObj) {
            await destroy(...Object.values(userObj));
        }
    }
});

test('Public asset can be read', async t => {
    let userObj;
    try {
        userObj = await createUser(t.context.server);
        const { session } = userObj;

        const headers = {
            cookie: `DW-SESSION=${session.id}; crumb=abc`,
            'X-CSRF-Token': 'abc',
            referer: 'http://localhost'
        };
        // create a new chart
        let res = await t.context.server.inject({
            method: 'POST',
            url: '/v3/charts',
            headers,
            payload: {}
        });
        const chart = res.result;

        const asset = `X1,X2
10,20`;

        res = await putAsset(t.context.server, headers, chart, `${chart.id}.csv`, { data: asset });
        t.is(res.statusCode, 204);

        // see if that worked
        res = await getAsset(t.context.server, headers, chart, `${chart.id}.csv`);
        t.is(res.statusCode, 200);
        t.is(JSON.parse(res.result).data, asset);

        // publish chart
        t.context.server.inject({
            method: 'POST',
            headers,
            url: `/v3/charts/${chart.id}/publish`
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
            url: `/v3/charts/${chart.id}/assets/${chart.id}.public.csv`
        });
        t.is(publicAsset.statusCode, 200);

        const nonPublicAsset = await t.context.server.inject({
            method: 'GET',
            headers: unauthenticatedHeaders,
            url: `/v3/charts/${chart.id}/assets/${chart.id}.csv`
        });
        t.is(nonPublicAsset.statusCode, 403);
    } finally {
        if (userObj) {
            await destroy(...Object.values(userObj));
        }
    }
});

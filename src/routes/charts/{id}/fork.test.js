const test = require('ava');
const { setup } = require('../../../../test/helpers/setup');
const { decamelizeKeys } = require('humps');

test.before(async t => {
    const { server, getUser, getTeamWithUser } = await setup({ usePlugins: false });

    t.context.server = server;
    t.context.getUser = getUser;
    t.context.getTeamWithUser = getTeamWithUser;

    // register fake d3-bars type
    server.methods.registerVisualization('d3-bars', [
        {
            id: 'd3-bars'
        }
    ]);
});

test("User can't fork an unforkable visualization", async t => {
    const { session } = await t.context.getUser();
    const headers = {
        cookie: `DW-SESSION=${session.id}; crumb=abc`,
        'X-CSRF-Token': 'abc',
        referer: 'http://localhost'
    };

    const attributes = {
        title: 'This is my chart',
        theme: 'datawrapper-data',
        language: 'en-IE',
        externalData: 'https://static.dwcdn.net/data/12345.csv',
        metadata: {
            visualize: {
                basemap: 'us-counties'
            }
        }
    };

    // create a new chart
    const createResponse = await t.context.server.inject({
        method: 'POST',
        url: '/v3/charts',
        headers,
        payload: attributes
    });

    t.is(createResponse.statusCode, 201);

    // fork new chart
    const forkResponse = await t.context.server.inject({
        method: 'POST',
        url: `/v3/charts/${createResponse.result.id}/fork`,
        headers
    });

    t.is(forkResponse.statusCode, 401);
});

test("User can't fork an unpublished visualization", async t => {
    const { session } = await t.context.getUser();
    const headers = {
        cookie: `DW-SESSION=${session.id}; crumb=abc`,
        'X-CSRF-Token': 'abc',
        referer: 'http://localhost'
    };

    const attributes = {
        title: 'This is my chart',
        theme: 'datawrapper-data',
        language: 'en-IE',
        forkable: true,
        externalData: 'https://static.dwcdn.net/data/12345.csv',
        metadata: {
            visualize: {
                basemap: 'us-counties'
            }
        }
    };

    // create a new chart
    const createResponse = await t.context.server.inject({
        method: 'POST',
        url: '/v3/charts',
        headers,
        payload: attributes
    });

    // fork new chart
    const forkResponse = await t.context.server.inject({
        method: 'POST',
        url: `/v3/charts/${createResponse.result.id}/fork`,
        headers
    });

    t.is(forkResponse.statusCode, 404);
});

test('User can fork fork-protected chart, attributes match', async t => {
    const { user, session } = await t.context.getUser();
    const { server } = t.context;
    const headers = {
        cookie: `DW-SESSION=${session.id}; crumb=abc`,
        'X-CSRF-Token': 'abc',
        referer: 'http://localhost'
    };

    const attributes = {
        title: 'This is my chart',
        theme: 'datawrapper-data',
        language: 'en-IE',
        externalData: 'https://static.dwcdn.net/data/12345.csv',
        forkable: true,
        metadata: {
            describe: {
                byline: 'Lorem Ipsum'
            },
            visualize: {
                basemap: 'us-counties'
            }
            // this is the default, so we don't need to set it
            // publish: {
            //     'protect-forks': true
            // }
        }
    };

    // create a new chart
    const createResponse = await server.inject({
        method: 'POST',
        url: '/v3/charts',
        headers,
        payload: attributes
    });

    t.true(createResponse.result.forkable);

    // upload some data
    const dataResponse = await server.inject({
        method: 'PUT',
        url: `/v3/charts/${createResponse.result.id}/data`,
        headers,
        payload: 'foo,bar\n12,23'
    });

    t.is(dataResponse.statusCode, 204);

    // create ChartPublic manually since /publish isn't working from tests yes
    const { ChartPublic } = require('@datawrapper/orm/models');
    await ChartPublic.create(decamelizeKeys(createResponse.result));

    // fork new chart
    const forkResponse = await server.inject({
        method: 'POST',
        url: `/v3/charts/${createResponse.result.id}/fork`,
        headers
    });

    t.is(forkResponse.statusCode, 201);

    const forkedChart = forkResponse.result;

    const allMetadata = await server.inject({
        method: 'GET',
        url: `/v3/charts/${forkedChart.id}`,
        headers
    });

    t.is(forkedChart.authorId, user.id);
    t.is(forkedChart.forkedFrom, createResponse.result.id);
    t.is(allMetadata.result.externalData, attributes.externalData);

    const expectedAttributes = {
        ...attributes,
        theme: 'default',
        language: 'en-US',
        isFork: true,
        forkable: undefined, // not returned from API,
        metadata: {
            ...attributes.metadata,
            describe: {
                intro: '',
                'source-name': '',
                'source-url': '',
                'aria-description': '',
                byline: '' // byline gets cleared since it's a protected fork
            }
        }
    };

    // compare attributes
    for (var attr in expectedAttributes) {
        if (attr === 'metadata') {
            t.deepEqual(forkedChart.metadata.visualize, expectedAttributes.metadata.visualize);
            t.deepEqual(forkedChart.metadata.describe, expectedAttributes.metadata.describe);
        } else {
            t.deepEqual(forkedChart[attr], expectedAttributes[attr], attr);
        }
    }
});

test('User can fork unprotected chart, attributes match', async t => {
    const { user, session } = await t.context.getUser();
    const { server } = t.context;
    const headers = {
        cookie: `DW-SESSION=${session.id}; crumb=abc`,
        'X-CSRF-Token': 'abc',
        referer: 'http://localhost'
    };

    const attributes = {
        title: 'This is my chart',
        theme: 'datawrapper-data',
        language: 'en-IE',
        externalData: 'https://static.dwcdn.net/data/12345.csv',
        forkable: true,
        metadata: {
            describe: {
                byline: 'Lorem Ipsum'
            },
            visualize: {
                basemap: 'us-counties'
            },
            publish: {
                'protect-forks': false
            }
        }
    };

    // create a new chart
    const createResponse = await server.inject({
        method: 'POST',
        url: '/v3/charts',
        headers,
        payload: attributes
    });

    t.true(createResponse.result.forkable);

    // upload some data
    const dataResponse = await server.inject({
        method: 'PUT',
        url: `/v3/charts/${createResponse.result.id}/data`,
        headers,
        payload: 'foo,bar\n12,23'
    });

    t.is(dataResponse.statusCode, 204);

    // create ChartPublic manually since /publish isn't working from tests yes
    const { ChartPublic } = require('@datawrapper/orm/models');
    await ChartPublic.create(decamelizeKeys(createResponse.result));

    // fork new chart
    const forkResponse = await server.inject({
        method: 'POST',
        url: `/v3/charts/${createResponse.result.id}/fork`,
        headers
    });

    t.is(forkResponse.statusCode, 201);

    const forkedChart = forkResponse.result;

    const allMetadata = await server.inject({
        method: 'GET',
        url: `/v3/charts/${forkedChart.id}`,
        headers
    });

    t.is(forkedChart.authorId, user.id);
    t.is(forkedChart.forkedFrom, createResponse.result.id);
    t.is(allMetadata.result.externalData, attributes.externalData);

    const expectedAttributes = {
        ...attributes,
        theme: 'default',
        language: 'en-US',
        isFork: undefined,
        forkable: undefined, // not returned from API,
        metadata: {
            ...attributes.metadata,
            describe: {
                intro: '',
                'source-name': '',
                'source-url': '',
                'aria-description': '',
                byline: 'Lorem Ipsum' // byline remains
            }
        }
    };

    // compare attributes
    for (var attr in expectedAttributes) {
        if (attr === 'metadata') {
            t.deepEqual(forkedChart.metadata.visualize, expectedAttributes.metadata.visualize);
            t.deepEqual(forkedChart.metadata.describe, expectedAttributes.metadata.describe);
        } else {
            t.deepEqual(forkedChart[attr], expectedAttributes[attr], attr);
        }
    }
});

test('User can fork chart, assets match', async t => {
    const { session } = await t.context.getUser();
    const { server } = t.context;

    const csv = `Col1,Col2
        10,20
        15,7`;

    const basemap = { type: 'FeatureCollection', features: [] };

    // create a new chart
    const createResponse = await server.inject({
        method: 'POST',
        url: '/v3/charts',
        headers: {
            cookie: `DW-SESSION=${session.id}; crumb=abc`,
            'X-CSRF-Token': 'abc',
            referer: 'http://localhost'
        },
        payload: {
            forkable: true
        }
    });

    // write chart data
    const writeData = await server.inject({
        method: 'PUT',
        headers: {
            cookie: `DW-SESSION=${session.id}; crumb=abc`,
            'X-CSRF-Token': 'abc',
            referer: 'http://localhost',
            'Content-Type': 'text/csv'
        },
        url: `/v3/charts/${createResponse.result.id}/data`,
        payload: csv
    });

    t.is(writeData.statusCode, 204);

    // write custom basemap
    const writeBasemap = await server.inject({
        method: 'PUT',
        headers: {
            cookie: `DW-SESSION=${session.id}; crumb=abc`,
            'X-CSRF-Token': 'abc',
            referer: 'http://localhost',
            'Content-Type': 'application/json'
        },
        url: `/v3/charts/${createResponse.result.id}/assets/${createResponse.result.id}.map.json`,
        payload: basemap
    });

    t.is(writeBasemap.statusCode, 204);

    // create ChartPublic manually since /publish isn't working from tests yes
    const { ChartPublic, Chart } = require('@datawrapper/orm/models');
    await ChartPublic.create(decamelizeKeys(createResponse.result));

    // also create "public" dataset
    const { events, event } = server.app;
    await events.emit(event.PUT_CHART_ASSET, {
        chart: await Chart.findByPk(createResponse.result.id),
        data: csv,
        filename: `${createResponse.result.id}.public.csv`
    });

    // fork new chart
    const forkedChart = await t.context.server.inject({
        method: 'POST',
        url: `/v3/charts/${createResponse.result.id}/fork`,
        headers: {
            cookie: `DW-SESSION=${session.id}; crumb=abc`,
            'X-CSRF-Token': 'abc',
            referer: 'http://localhost'
        }
    });

    // compare data
    const forkedData = await t.context.server.inject({
        method: 'GET',
        url: `/v3/charts/${forkedChart.result.id}/data`,
        headers: {
            cookie: `DW-SESSION=${session.id}`
        }
    });

    t.is(forkedData.result, csv);

    // compare basemap
    const forkedBasemap = await t.context.server.inject({
        method: 'GET',
        url: `/v3/charts/${forkedChart.result.id}/assets/${forkedChart.result.id}.map.json`,
        headers: {
            cookie: `DW-SESSION=${session.id}`
        }
    });

    t.is(forkedBasemap.result, JSON.stringify(basemap));
});

const test = require('ava');
const { setup } = require('../../../../test/helpers/setup');

test.before(async t => {
    const { server, getUser, getTeamWithUser } = await setup({ usePlugins: false });

    t.context.server = server;
    t.context.getUser = getUser;
    t.context.getTeamWithUser = getTeamWithUser;
});

test('User can copy chart, attributes match', async t => {
    const { user, session } = await t.context.getUser();
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
    const srcChart = await t.context.server.inject({
        method: 'POST',
        url: '/v3/charts',
        headers,
        payload: attributes
    });

    // copy new chart
    const copiedChart = await t.context.server.inject({
        method: 'POST',
        url: `/v3/charts/${srcChart.result.id}/copy`,
        headers
    });

    const allMetadata = await t.context.server.inject({
        method: 'GET',
        url: `/v3/charts/${copiedChart.result.id}`,
        headers
    });

    const expectedAttributes = {
        ...attributes,
        metadata: {
            ...attributes.metadata,
            data: {},
            publish: {},
            describe: {
                intro: '',
                'source-name': '',
                'source-url': '',
                'aria-description': '',
                byline: ''
            }
        }
    };

    t.is(copiedChart.statusCode, 201);
    t.is(copiedChart.result.authorId, user.id);
    t.is(copiedChart.result.forkedFrom, srcChart.result.id);
    t.is(allMetadata.result.externalData, attributes.externalData);

    // compare attributes
    for (var attr in attributes) {
        if (attr === 'title') {
            t.is(copiedChart.result[attr], `${expectedAttributes[attr]} (Copy)`);
        } else if (attr === 'metadata') {
            t.is(copiedChart.result.metadata.visualize.basemap, 'us-counties');
        } else {
            t.deepEqual(copiedChart.result[attr], expectedAttributes[attr]);
        }
    }
});

test('User can copy chart, assets match', async t => {
    const { session } = await t.context.getUser();

    const csv = `Col1,Col2
        10,20
        15,7`;

    const basemap = { type: 'FeatureCollection', features: [] };

    // create a new chart
    const srcChart = await t.context.server.inject({
        method: 'POST',
        url: '/v3/charts',
        headers: {
            cookie: `DW-SESSION=${session.id}; crumb=abc`,
            'X-CSRF-Token': 'abc',
            referer: 'http://localhost'
        },
        payload: {}
    });

    // write chart data
    const writeData = await t.context.server.inject({
        method: 'PUT',
        headers: {
            cookie: `DW-SESSION=${session.id}; crumb=abc`,
            'X-CSRF-Token': 'abc',
            referer: 'http://localhost',
            'Content-Type': 'text/csv'
        },
        url: `/v3/charts/${srcChart.result.id}/data`,
        payload: csv
    });

    t.is(writeData.statusCode, 204);

    // write custom basemap
    const writeBasemap = await t.context.server.inject({
        method: 'PUT',
        headers: {
            cookie: `DW-SESSION=${session.id}; crumb=abc`,
            'X-CSRF-Token': 'abc',
            referer: 'http://localhost',
            'Content-Type': 'application/json'
        },
        url: `/v3/charts/${srcChart.result.id}/assets/${srcChart.result.id}.map.json`,
        payload: basemap
    });

    t.is(writeBasemap.statusCode, 204);

    // copy new chart
    const copiedChart = await t.context.server.inject({
        method: 'POST',
        url: `/v3/charts/${srcChart.result.id}/copy`,
        headers: {
            cookie: `DW-SESSION=${session.id}; crumb=abc`,
            'X-CSRF-Token': 'abc',
            referer: 'http://localhost'
        }
    });

    // compare data
    const copiedData = await t.context.server.inject({
        method: 'GET',
        url: `/v3/charts/${copiedChart.result.id}/data`,
        headers: {
            cookie: `DW-SESSION=${session.id}`
        }
    });

    t.is(copiedData.result, csv);

    // compare basemap
    const copiedBasemap = await t.context.server.inject({
        method: 'GET',
        url: `/v3/charts/${copiedChart.result.id}/assets/${copiedChart.result.id}.map.json`,
        headers: {
            cookie: `DW-SESSION=${session.id}`
        }
    });

    t.is(copiedBasemap.result, JSON.stringify(basemap));
});

test('Chart belonging to team duplicates to that team', async t => {
    const { team, user, session } = await t.context.getTeamWithUser();
    const headers = {
        cookie: `DW-SESSION=${session.id}; crumb=abc`,
        'X-CSRF-Token': 'abc',
        referer: 'http://localhost'
    };

    // user creates chart
    const srcChart = await t.context.server.inject({
        method: 'POST',
        url: '/v3/charts',
        headers,
        payload: {
            organizationId: team.id
        }
    });

    t.is(srcChart.result.organizationId, team.id);
    t.is(srcChart.result.authorId, user.id);

    // user copies chart
    const copiedChart = await t.context.server.inject({
        method: 'POST',
        url: `/v3/charts/${srcChart.result.id}/copy`,
        headers
    });

    t.is(copiedChart.statusCode, 201);
    t.is(copiedChart.result.authorId, user.id);
    t.is(copiedChart.result.organizationId, team.id);
});

test('Copies made by admins are stored in their personal root folder ', async t => {
    const { team, user, session: ownerSession } = await t.context.getTeamWithUser();
    const { user: adminUser, session: adminSession } = await t.context.getUser('admin');
    const userHeaders = {
        cookie: `DW-SESSION=${ownerSession.id}; crumb=abc`,
        'X-CSRF-Token': 'abc',
        referer: 'http://localhost'
    };
    const adminHeaders = {
        cookie: `DW-SESSION=${adminSession.id}; crumb=abc`,
        'X-CSRF-Token': 'abc',
        referer: 'http://localhost'
    };

    // user creates chart
    const srcChart = await t.context.server.inject({
        method: 'POST',
        url: '/v3/charts',
        headers: userHeaders,
        payload: {
            organizationId: team.id
        }
    });

    t.is(srcChart.result.organizationId, team.id);
    t.is(srcChart.result.authorId, user.id);

    // admin copies chart
    const copiedChart = await t.context.server.inject({
        method: 'POST',
        url: `/v3/charts/${srcChart.result.id}/copy`,
        headers: adminHeaders
    });

    t.is(copiedChart.statusCode, 201);
    t.is(copiedChart.result.authorId, adminUser.id);
    t.is(copiedChart.result.organizationId, undefined);
});

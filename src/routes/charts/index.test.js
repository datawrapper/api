const test = require('ava');
const { setup } = require('../../../test/helpers/setup');

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
    t.context.headers = {
        cookie: 'crumb=abc',
        'X-CSRF-Token': 'abc',
        referer: 'http://localhost'
    };
});

test('Should be possible to search in multiple fields', async t => {
    let chart = await t.context.server.inject({
        method: 'POST',
        url: '/v3/charts',
        auth: t.context.auth,
        headers: t.context.headers,
        payload: {
            title: 'title-search',
            metadata: {
                describe: {
                    intro: 'intro-search',
                    byline: 'byline-search',
                    'source-name': 'source-search',
                    'source-url': 'https://source.com'
                },
                annotate: {
                    notes: 'notes-search'
                }
            }
        }
    });

    const chartId = chart.result.id;

    const searchQueries = ['title', 'intro', 'byline', 'source', 'source.com', 'notes'];

    for (const query of searchQueries) {
        chart = await t.context.server.inject({
            method: 'GET',
            url: `/v3/charts?search=${query}`,
            auth: t.context.auth
        });

        t.is(chart.result.list.length, 1);
        t.is(chart.result.list[0].id, chartId);
    }
});

test('Users can create charts in a team they have access to', async t => {
    const { team, session } = await t.context.getTeamWithUser('member');

    const chart = await t.context.server.inject({
        method: 'POST',
        url: '/v3/charts',
        headers: {
            cookie: `DW-SESSION=${session.id}; crumb=abc`,
            'X-CSRF-Token': 'abc',
            referer: 'http://localhost'
        },
        payload: {
            organizationId: team.id
        }
    });

    t.is(chart.statusCode, 201);
});

test('Users can create charts with settings set', async t => {
    const { team, session } = await t.context.getTeamWithUser('member');

    const chart = await t.context.server.inject({
        method: 'POST',
        url: '/v3/charts',
        headers: {
            cookie: `DW-SESSION=${session.id}; crumb=abc`,
            'X-CSRF-Token': 'abc',
            referer: 'http://localhost'
        },
        payload: {
            organizationId: team.id,
            title: 'My new visualization',
            type: 'd3-bars',
            metadata: {
                axes: [],
                describe: {
                    intro: 'A description',
                    byline: ''
                }
            }
        }
    });

    t.is(chart.statusCode, 201);
    t.is(chart.result.type, 'd3-bars');
    t.is(chart.result.title, 'My new visualization');
    t.is(chart.result.metadata.describe.intro, 'A description');
    t.is(chart.result.metadata.describe.byline, '');
});

test('Users cannot create chart in a team they dont have access to', async t => {
    const { session } = await t.context.getUser();
    const { team } = await t.context.getTeamWithUser('member');

    const chart = await t.context.server.inject({
        method: 'POST',
        url: '/v3/charts',
        headers: {
            cookie: `DW-SESSION=${session.id}; crumb=abc`,
            'X-CSRF-Token': 'abc',
            referer: 'http://localhost'
        },
        payload: {
            organizationId: team.id
        }
    });

    t.is(chart.statusCode, 403);
});

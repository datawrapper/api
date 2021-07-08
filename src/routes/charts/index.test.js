const test = require('ava');
const { createTeamWithUser, createUser, destroy, setup } = require('../../../test/helpers/setup');

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
});

test.after.always(async t => {
    await destroy(...Object.values(t.context.userObj));
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
                axes: [],
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
    let teamObj;
    try {
        teamObj = await createTeamWithUser(t.context.server, 'member');
        const { team, session } = teamObj;

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
    } finally {
        if (teamObj) {
            await destroy(...Object.values(teamObj));
        }
    }
});

test('Users can create charts with settings set', async t => {
    let teamObj;
    try {
        teamObj = await createTeamWithUser(t.context.server, 'member');
        const { team, session } = teamObj;

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
    } finally {
        if (teamObj) {
            await destroy(...Object.values(teamObj));
        }
    }
});

test('Users can create a chart in a team when authenticating with a token', async t => {
    let teamObj;
    try {
        teamObj = await createTeamWithUser(t.context.server, 'member');
        const { team, token } = teamObj;

        const chart = await t.context.server.inject({
            method: 'POST',
            url: '/v3/charts',
            headers: {
                Authorization: `Bearer ${token}`
            },
            payload: {
                organizationId: team.id,
                title: 'My new visualization',
                type: 'd3-bars'
            }
        });
        t.is(chart.statusCode, 201);
        t.is(chart.result.type, 'd3-bars');
        t.is(chart.result.title, 'My new visualization');
        t.is(chart.result.organizationId, team.id);
    } finally {
        if (teamObj) {
            await destroy(...Object.values(teamObj));
        }
    }
});

test('Users cannot create a chart with an invalid token', async t => {
    let teamObj;
    try {
        teamObj = await createTeamWithUser(t.context.server, 'member');
        const { team } = teamObj;

        const chart = await t.context.server.inject({
            method: 'POST',
            url: '/v3/charts',
            headers: {
                Authorization: `Bearer XXXXXXXXX`
            },
            payload: {
                organizationId: team.id,
                title: 'My new visualization',
                type: 'd3-bars'
            }
        });
        t.is(chart.statusCode, 401);
    } finally {
        if (teamObj) {
            await destroy(...Object.values(teamObj));
        }
    }
});

test('Users cannot create chart in a team they dont have access to (token auth)', async t => {
    let userObj;
    let teamObj;
    try {
        userObj = await createUser(t.context.server);
        const { token } = userObj;
        teamObj = await createTeamWithUser(t.context.server, 'member');
        const { team } = teamObj;

        const chart = await t.context.server.inject({
            method: 'POST',
            url: '/v3/charts',
            headers: {
                Authorization: `Bearer ${token}`
            },
            payload: {
                organizationId: team.id
            }
        });

        t.is(chart.statusCode, 403);
    } finally {
        if (userObj) {
            await destroy(...Object.values(userObj));
        }
        if (teamObj) {
            await destroy(...Object.values(teamObj));
        }
    }
});

test('Users cannot create chart in a team they dont have access to (session auth)', async t => {
    let userObj;
    let teamObj;
    try {
        userObj = await createUser(t.context.server);
        const { session } = userObj;
        teamObj = await createTeamWithUser(t.context.server, 'member');
        const { team } = teamObj;

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
    } finally {
        if (userObj) {
            await destroy(...Object.values(userObj));
        }
        if (teamObj) {
            await destroy(...Object.values(teamObj));
        }
    }
});

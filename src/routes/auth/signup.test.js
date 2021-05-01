const test = require('ava');

const { setup } = require('../../../test/helpers/setup');

test.before(async t => {
    const { server, models, getUser, getCredentials, addToCleanup, getTeamWithUser } = await setup({
        usePlugins: false
    });

    t.context.server = server;

    const { user, session, token } = await getUser();
    t.context.user = user;
    t.context.session = session.id;
    t.context.token = token;
    t.context.models = models;
    t.context.getUser = getUser;
    t.context.getTeamWithUser = getTeamWithUser;
    t.context.getCredentials = getCredentials;
    t.context.addToCleanup = addToCleanup;
});

test('Guest charts are associated after signup', async t => {
    /* Get guest session */
    let res = await t.context.server.inject({
        method: 'POST',
        url: '/v3/auth/session'
    });

    t.is(res.statusCode, 200);

    const session = res.result['DW-SESSION'];

    /* Create chart as guest */
    res = await t.context.server.inject({
        method: 'POST',
        url: '/v3/charts',
        headers: {
            cookie: `DW-SESSION=${session}; crumb=abc`,
            'X-CSRF-Token': 'abc',
            referer: 'http://localhost'
        },
        payload: {
            title: 'Test guest chart'
        }
    });

    const chartId = res.result.id;
    t.log('Chart ID:', chartId);
    t.is(res.result.title, 'Test guest chart');
    t.is(res.result.authorId, null);

    res = await t.context.server.inject({
        method: 'POST',
        url: '/v3/auth/signup',
        headers: {
            cookie: `DW-SESSION=${session}; crumb=abc`,
            'X-CSRF-Token': 'abc',
            referer: 'http://localhost'
        },
        payload: t.context.getCredentials()
    });

    const authorId = res.result.id;
    t.log('Author ID:', authorId);
    await t.context.addToCleanup('user', authorId);

    const charts = await t.context.models.Chart.findAll({
        where: {
            author_id: authorId
        }
    });

    t.is(charts.length, 1);
    t.is(charts[0].id, chartId);
});

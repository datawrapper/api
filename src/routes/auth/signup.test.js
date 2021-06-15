const test = require('ava');
const { createUser, destroy, getCredentials, setup } = require('../../../test/helpers/setup');

test.before(async t => {
    t.context.server = await setup({ usePlugins: false });
    t.context.userObj = await createUser(t.context.server);
    t.context.user = t.context.userObj.user;
    t.context.session = t.context.userObj.session.id;
    t.context.token = t.context.userObj.token;
});

test.after.always(async t => {
    await destroy(...Object.values(t.context.userObj));
});

test('Guest charts are associated after signup', async t => {
    const { Chart, User } = require('@datawrapper/orm/models');

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

    let authorId;
    try {
        res = await t.context.server.inject({
            method: 'POST',
            url: '/v3/auth/signup',
            headers: {
                cookie: `DW-SESSION=${session}; crumb=abc`,
                'X-CSRF-Token': 'abc',
                referer: 'http://localhost'
            },
            payload: getCredentials()
        });

        authorId = res.result.id;
        t.log('Author ID:', authorId);

        const charts = await Chart.findAll({
            where: {
                author_id: authorId
            }
        });

        t.is(charts.length, 1);
        t.is(charts[0].id, chartId);
    } finally {
        if (authorId) {
            const author = await User.findByPk(authorId);
            await destroy(author);
        }
    }
});

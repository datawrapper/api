import test from 'ava';
import { setup } from '../../test/helpers/setup';

test.before(async t => {
    const { server, getUser } = await setup({ usePlugins: false });
    const data = await getUser('admin');

    t.context.server = server;
    t.context.data = data;
    t.context.auth = {
        strategy: 'session',
        credentials: data.session,
        artifacts: data.user
    };
});

test('It should be possible to create, fetch, edit and delete charts', async t => {
    let chart = await t.context.server.inject({
        method: 'POST',
        url: '/v3/charts',
        auth: t.context.auth
    });

    t.is(chart.result.authorId, t.context.data.user.id);
    t.is(chart.result.id.length, 5);
    t.is(typeof chart.result.metadata, 'object');

    chart = await t.context.server.inject({
        method: 'GET',
        url: `/v3/charts/${chart.result.id}`,
        auth: t.context.auth
    });

    t.truthy(chart.result.authorId);
    t.is(chart.result.id.length, 5);

    chart = await t.context.server.inject({
        method: 'PATCH',
        url: `/v3/charts/${chart.result.id}`,
        auth: t.context.auth,
        payload: {
            title: 'TEST TITLE'
        }
    });

    t.is(chart.result.title, 'TEST TITLE');

    chart = await t.context.server.inject({
        method: 'DELETE',
        url: `/v3/charts/${chart.result.id}`,
        auth: t.context.auth
    });

    t.is(chart.statusCode, 204);
});

test('Admins should see author information', async t => {
    let chart = await t.context.server.inject({
        method: 'POST',
        url: '/v3/charts',
        auth: t.context.auth
    });

    chart = await t.context.server.inject({
        method: 'GET',
        url: `/v3/charts/${chart.result.id}`,
        auth: t.context.auth
    });

    t.truthy(chart.result.author);
    t.is(chart.result.author.email, t.context.data.user.email);
});

test('Should be possible to search in multiple fields', async t => {
    let chart = await t.context.server.inject({
        method: 'POST',
        url: '/v3/charts',
        auth: t.context.auth,
        payload: {
            title: 'title-search',
            metadata: {
                describe: {
                    intro: 'intro-search',
                    byline: 'byline-search',
                    'source-name': 'source-search',
                    'source-url': 'https://source.com'
                }
            }
        }
    });

    const chartId = chart.result.id;

    const searchQueries = ['title', 'intro', 'byline', 'source', 'source.com'];

    for (let query of searchQueries) {
        chart = await t.context.server.inject({
            method: 'GET',
            url: `/v3/charts?search=${query}`,
            auth: t.context.auth
        });

        t.is(chart.result.list.length, 1);
        t.is(chart.result.list[0].id, chartId);
    }
});

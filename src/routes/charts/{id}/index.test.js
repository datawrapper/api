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
    t.context.headers = {
        cookie: 'crumb=abc',
        'X-CSRF-Token': 'abc'
    };
});

test('It should be possible to create, fetch, edit and delete charts', async t => {
    let chart = await t.context.server.inject({
        method: 'POST',
        url: '/v3/charts',
        auth: t.context.auth,
        headers: t.context.headers
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
        headers: t.context.headers,
        payload: {
            title: 'TEST TITLE'
        }
    });

    t.is(chart.result.title, 'TEST TITLE');

    chart = await t.context.server.inject({
        method: 'DELETE',
        url: `/v3/charts/${chart.result.id}`,
        auth: t.context.auth,
        headers: t.context.headers
    });

    t.is(chart.statusCode, 204);
});

test('Admins should see author information', async t => {
    let chart = await t.context.server.inject({
        method: 'POST',
        url: '/v3/charts',
        auth: t.context.auth,
        headers: t.context.headers
    });

    chart = await t.context.server.inject({
        method: 'GET',
        url: `/v3/charts/${chart.result.id}`,
        auth: t.context.auth
    });

    t.truthy(chart.result.author);
    t.is(chart.result.author.email, t.context.data.user.email);
});

test('Users can not change the author ID of a chart', async t => {
    const { user, session } = await t.context.getUser();
    let chart = await t.context.server.inject({
        method: 'POST',
        url: '/v3/charts',
        headers: {
            cookie: `DW-SESSION=${session.id}; crumb=abc`,
            'X-CSRF-Token': 'abc'
        }
    });

    t.is(chart.result.authorId, user.id);

    chart = await t.context.server.inject({
        method: 'PATCH',
        url: `/v3/charts/${chart.result.id}`,
        headers: {
            cookie: `DW-SESSION=${session.id}; crumb=abc`,
            'X-CSRF-Token': 'abc'
        },
        payload: {
            authorId: null
        }
    });

    t.is(chart.result.authorId, user.id);
});

test('Users can edit chart medatata', async t => {
    const { session } = await t.context.getUser();
    let chart = await t.context.server.inject({
        method: 'POST',
        url: '/v3/charts',
        headers: {
            cookie: `DW-SESSION=${session.id}; crumb=abc`,
            'X-CSRF-Token': 'abc'
        },
        payload: {
            metadata: {
                annotate: {
                    notes: 'note-1'
                }
            }
        }
    });

    t.is(chart.result.metadata.annotate.notes, 'note-1');
    t.log('set new metadata property: ', chart.result.metadata.annotate.notes);

    chart = await t.context.server.inject({
        method: 'PATCH',
        url: `/v3/charts/${chart.result.id}`,
        headers: {
            cookie: `DW-SESSION=${session.id}; crumb=abc`,
            'X-CSRF-Token': 'abc'
        },
        payload: {
            metadata: {
                annotate: {
                    notes: 'note-2'
                },
                visualize: {
                    'base-color': 'red',
                    'custom-colors': {
                        column1: '#ff0000'
                    }
                }
            }
        }
    });

    t.is(chart.result.metadata.annotate.notes, 'note-2');
    t.is(chart.result.metadata.visualize['base-color'], 'red');
    t.log('overwrite existing metadata property: ', chart.result.metadata.annotate.notes);

    t.is(chart.result.metadata.visualize['custom-colors'].column1, '#ff0000');

    chart = await t.context.server.inject({
        method: 'PATCH',
        url: `/v3/charts/${chart.result.id}`,
        headers: {
            cookie: `DW-SESSION=${session.id}; crumb=abc`,
            'X-CSRF-Token': 'abc'
        },
        payload: {
            metadata: {
                visualize: {
                    'custom-colors': {}
                }
            }
        }
    });

    t.deepEqual(chart.result.metadata.visualize['custom-colors'], {});
    t.log(
        'set an existing metadata property to empty object: ',
        chart.result.metadata.visualize['custom-colors']
    );

    t.is(chart.result.metadata.annotate.notes, 'note-2');
    t.is(chart.result.metadata.visualize['base-color'], 'red');
    t.log(
        'previously existing metadata property still exists: ',
        chart.result.metadata.annotate.notes
    );

    chart = await t.context.server.inject({
        method: 'GET',
        url: `/v3/charts/${chart.result.id}`,
        headers: {
            cookie: `DW-SESSION=${session.id}`
        }
    });

    t.is(chart.result.metadata.annotate.notes, 'note-2');
});

test('PUT request replace metadata', async t => {
    const { session } = await t.context.getUser();
    let chart = await t.context.server.inject({
        method: 'POST',
        url: '/v3/charts',
        headers: {
            cookie: `DW-SESSION=${session.id}; crumb=abc`,
            'X-CSRF-Token': 'abc'
        },
        payload: {
            metadata: {
                annotate: {
                    notes: 'note-1'
                },
                visualize: {
                    foo: 'bar'
                }
            }
        }
    });

    t.is(chart.result.metadata.annotate.notes, 'note-1');
    t.is(chart.result.metadata.visualize.foo, 'bar');

    chart = await t.context.server.inject({
        method: 'PUT',
        url: `/v3/charts/${chart.result.id}`,
        headers: {
            cookie: `DW-SESSION=${session.id}; crumb=abc`,
            'X-CSRF-Token': 'abc'
        },
        payload: {
            metadata: {
                annotate: {
                    notes: 'note-2'
                }
            }
        }
    });

    t.is(chart.result.metadata.annotate.notes, 'note-2');
    t.is(chart.result.metadata.visualize, undefined);
});

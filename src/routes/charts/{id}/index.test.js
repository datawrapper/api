const test = require('ava');
const { createUser, destroy, setup } = require('../../../../test/helpers/setup');

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

test('It should be possible to create, fetch, edit and delete charts', async t => {
    let chart = await t.context.server.inject({
        method: 'POST',
        url: '/v3/charts',
        auth: t.context.auth,
        headers: t.context.headers
    });

    t.is(chart.result.authorId, t.context.userObj.user.id);
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
    t.is(chart.result.author.email, t.context.userObj.user.email);
});

test('Users can not change the author ID of a chart', async t => {
    let userObj;
    try {
        userObj = await createUser(t.context.server);
        const { user, session } = userObj;

        let chart = await t.context.server.inject({
            method: 'POST',
            url: '/v3/charts',
            headers: {
                cookie: `DW-SESSION=${session.id}; crumb=abc`,
                'X-CSRF-Token': 'abc',
                referer: 'http://localhost'
            }
        });

        t.is(chart.result.authorId, user.id);

        chart = await t.context.server.inject({
            method: 'PATCH',
            url: `/v3/charts/${chart.result.id}`,
            headers: {
                cookie: `DW-SESSION=${session.id}; crumb=abc`,
                'X-CSRF-Token': 'abc',
                referer: 'http://localhost'
            },
            payload: {
                authorId: null
            }
        });

        t.is(chart.result.authorId, user.id);
    } finally {
        if (userObj) {
            await destroy(...Object.values(userObj));
        }
    }
});

test('Users can edit chart medatata', async t => {
    let userObj;
    try {
        userObj = await createUser(t.context.server);
        const { session } = userObj;

        let chart = await t.context.server.inject({
            method: 'POST',
            url: '/v3/charts',
            headers: {
                cookie: `DW-SESSION=${session.id}; crumb=abc`,
                'X-CSRF-Token': 'abc',
                referer: 'http://localhost'
            },
            payload: {
                metadata: {
                    annotate: {
                        notes: 'note-1'
                    }
                }
            }
        });

        t.is(chart.statusCode, 201);
        t.is(chart.result.metadata.annotate.notes, 'note-1');
        t.log('set new metadata property: ', chart.result.metadata.annotate.notes);

        chart = await t.context.server.inject({
            method: 'PATCH',
            url: `/v3/charts/${chart.result.id}`,
            headers: {
                cookie: `DW-SESSION=${session.id}; crumb=abc`,
                'X-CSRF-Token': 'abc',
                referer: 'http://localhost'
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
                'X-CSRF-Token': 'abc',
                referer: 'http://localhost'
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
    } finally {
        if (userObj) {
            await destroy(...Object.values(userObj));
        }
    }
});

test('PUT request replace metadata', async t => {
    let userObj;
    try {
        userObj = await createUser(t.context.server);
        const { session } = userObj;

        let chart = await t.context.server.inject({
            method: 'POST',
            url: '/v3/charts',
            headers: {
                cookie: `DW-SESSION=${session.id}; crumb=abc`,
                'X-CSRF-Token': 'abc',
                referer: 'http://localhost'
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
                'X-CSRF-Token': 'abc',
                referer: 'http://localhost'
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
    } finally {
        if (userObj) {
            await destroy(...Object.values(userObj));
        }
    }
});

test('Users can get only published charts', async t => {
    const resChart = await t.context.server.inject({
        method: 'POST',
        url: '/v3/charts',
        auth: t.context.auth,
        headers: t.context.headers,
        payload: {
            title: 'Published version'
        }
    });
    const chartId = resChart.result.id;
    const { session } = await t.context.getUser();

    const resUnpublishedChart = await t.context.server.inject({
        method: 'GET',
        url: `/v3/charts/${chartId}`,
        headers: {
            cookie: `DW-SESSION=${session.id}; crumb=abc`
        }
    });

    t.is(resUnpublishedChart.statusCode, 401);

    await t.context.server.inject({
        method: 'POST',
        url: `/v3/charts/${chartId}/publish`,
        auth: t.context.auth,
        headers: t.context.headers
    });
    await t.context.server.inject({
        method: 'PUT',
        url: `/v3/charts/${chartId}`,
        auth: t.context.auth,
        headers: t.context.headers,
        payload: {
            title: 'New version'
        }
    });

    const resPublishedChart = await t.context.server.inject({
        method: 'GET',
        url: `/v3/charts/${chartId}`,
        headers: {
            cookie: `DW-SESSION=${session.id}; crumb=abc`
        }
    });

    t.is(resPublishedChart.statusCode, 200);
    t.is(resPublishedChart.result.id, resChart.result.id);
    t.is(resPublishedChart.result.title, 'Published version');
});

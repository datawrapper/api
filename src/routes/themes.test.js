const test = require('ava');
const { createUser, destroy, setup } = require('../../test/helpers/setup');

test.before(async t => {
    t.context.server = await setup({ usePlugins: false });
    t.context.userObj = await createUser(t.context.server);
    t.context.auth = {
        strategy: 'session',
        credentials: t.context.userObj.session,
        artifacts: t.context.userObj.user
    };
    const { Theme } = require('@datawrapper/orm/models');
    t.context.themes = await Promise.all([
        await Theme.findOrCreate({
            where: { id: 'my-theme-1' },
            defaults: {
                title: 'Test Theme',
                data: { test: 'test', deep: { key: [1, 2, 3] } },
                less: 'h1 { z-index: 1 }',
                assets: {}
            }
        }),
        await Theme.findOrCreate({
            where: { id: 'my-theme-2' },
            defaults: {
                title: 'Test Theme 2',
                data: { test: 'test', deep: { key: [3, 4, 5] } },
                extend: 'my-theme-1',
                less: 'h1 { z-index: 2 }',
                assets: { key1: 1, key2: { deep: true } }
            }
        }),
        await Theme.findOrCreate({
            where: { id: 'my-theme-3' },
            defaults: {
                title: 'Test Theme 3',
                data: { test: 'test3' },
                extend: 'my-theme-2',
                less: 'h1 { z-index: 3 }',
                assets: {
                    key1: 1,
                    key2: { blue: false },
                    Roboto: {
                        type: 'font',
                        import: 'https://static.dwcdn.net/css/roboto.css',
                        method: 'import'
                    }
                }
            }
        }),
        await Theme.findOrCreate({
            where: { id: 'my-theme-4' },
            defaults: {
                title: 'Test Theme 4',
                data: { test: 'test4' },
                extend: 'my-theme-2',
                less: 'h1 { z-index: 3 }',
                assets: {
                    Roboto: {
                        type: 'font',
                        import: 'https://static.dwcdn.net/css/roboto.css',
                        method: 'import'
                    }
                }
            }
        })
    ]);
});

test.after.always(async t => {
    if (t.context.themes) {
        await destroy(...t.context.themes);
    }
});

test('Should be possible to get theme data', async t => {
    const res = await t.context.server.inject({
        method: 'GET',
        url: '/v3/themes/my-theme-3',
        auth: t.context.auth
    });

    /* remove creation date or snapshots will fail all the time */
    delete res.result.createdAt;
    t.snapshot(res.result);
});

test('Should be possible to get theme font', async t => {
    const res = await t.context.server.inject({
        method: 'GET',
        url: '/v3/themes/my-theme-4',
        auth: t.context.auth
    });

    t.is(res.result.fontsCSS, '@import "https://static.dwcdn.net/css/roboto.css";');
});

test('Should be possible to get extended theme data', async t => {
    const res = await t.context.server.inject({
        method: 'GET',
        url: '/v3/themes/my-theme-3?extend=true',
        auth: t.context.auth
    });

    const theme = res.result;

    /* check that assets are shallow merged when extending */
    t.is(theme.assets.key2.deep, undefined);
    t.is(theme.assets.key2.blue, false);
    /* check if deep key from my-theme-2 was merged correctly */
    t.deepEqual(theme.data.deep.key, [3, 4, 5]);
    t.snapshot(theme.less);
    t.snapshot(theme.data);
});

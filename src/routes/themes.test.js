import test from 'ava';

import { setup } from '../../test/helpers/setup';

test.before(async t => {
    const { server, createTheme, getUser } = await setup({ usePlugins: false });
    t.context.server = server;
    const { user, session } = await getUser();

    t.context.auth = {
        strategy: 'session',
        credentials: session,
        artifacts: user
    };

    t.context.theme = await createTheme({
        title: 'Test Theme',
        id: 'my-theme-1',
        data: { test: 'test', deep: { key: [1, 2, 3] } },
        less: 'h1 { z-index: 1 }'
    });

    t.context.secondTheme = await createTheme({
        title: 'Test Theme 2',
        id: 'my-theme-2',
        data: { test: 'test', deep: { key: [3, 4, 5] } },
        extend: 'my-theme-1',
        less: 'h1 { z-index: 2 }',
        assets: { key1: 1, key2: { deep: true } }
    });

    t.context.thirdTheme = await createTheme({
        title: 'Test Theme 3',
        id: 'my-theme-3',
        data: { test: 'test3' },
        extend: 'my-theme-2',
        less: 'h1 { z-index: 3 }',
        assets: { key1: 1, key2: { blue: false } }
    });
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

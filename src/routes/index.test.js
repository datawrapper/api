import test from 'ava';

import { init } from '../server';

test.before(async t => {
    t.context.server = await init({ usePlugins: false });
});

test('Routes should be defined', async t => {
    const routes = t.context.server.table().map(route => `${route.method.padEnd(6)} ${route.path}`);

    t.snapshot(routes);
});

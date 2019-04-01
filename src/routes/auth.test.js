import test from 'ava';

import { init } from '../server';

test.before(async t => {
    t.context.server = await init({ usePlugins: false });
});

test.todo('POST v3/auth/login exists');

test.todo('POST v3/auth/logout exists');

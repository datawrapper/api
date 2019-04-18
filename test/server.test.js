import test from 'ava';
import EventEmitter from 'events';
import OpenAPIValidator from 'openapi-schema-validator';

import { init } from '../src/server';

test.before(async t => {
    t.context.server = await init();
});

test('Server should be registered', t => {
    t.truthy(t.context.server);
    t.truthy(t.context.server.registrations['dw-auth']);
});

test('v3/ should return OpenAPI doc', async t => {
    const openapi = new OpenAPIValidator({ version: 2 });

    const res = await t.context.server.inject('/v3');

    t.is(openapi.validate(res.result).errors.length, 0);
});

test('3/ should redirect to v3/', async t => {
    const res = await t.context.server.inject('/3');
    t.is(res.statusCode, 301);
    t.is(res.headers['location'], '/v3');
});

test('Plugin "hello world" should be registered', async t => {
    t.truthy(t.context.server.registrations['hello-world']);

    const res = await t.context.server.inject('/v3/hello-world');
    t.is(res.result.data, 'Hello from plugin');
    t.is(res.statusCode, 200);
});

test('Events should be available', t => {
    t.true(t.context.server.app.events instanceof EventEmitter);
    t.is(typeof t.context.server.app.event, 'object');
});

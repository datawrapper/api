import test from 'ava';
import OpenAPIValidator from 'openapi-schema-validator';

import { init } from '../src/server';

let server;

test.before(async t => {
    server = await init();
});

test('Server - should be registered', t => {
    t.truthy(server);
    t.truthy(server.registrations['dw-auth']);
});

test('Route - v3/ - should return OpenAPI doc', async t => {
    const openapi = new OpenAPIValidator({ version: 2 });

    const res = await server.inject('/v3');

    t.is(openapi.validate(res.result).errors.length, 0);
});

test('Route - 3/ should redirect to v3/', async t => {
    const res = await server.inject('/3');
    t.is(res.request.route.path, '/v3');
});

test('Plugin - "hello world" should be registered', async t => {
    t.truthy(server.registrations['hello-world']);

    const res = await server.inject('/v3/hello-world');
    t.is(res.result.data, 'Hello from plugin');
    t.is(res.statusCode, 200);
});

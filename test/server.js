import test from 'ava';
import OpenAPIValidator from 'openapi-schema-validator';

import server from '../src';

test('Server - should be registered', t => {
    t.truthy(server);
    t.truthy(server.registrations['dw-auth']);
});

test('Route - v3/ - should return OpenAPI doc', async t => {
    const openapi = new OpenAPIValidator({ version: 2 });

    const res = await server.inject('/v3');

    t.is(openapi.validate(res.result).errors.length, 0);
});

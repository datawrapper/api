const test = require('ava');
const EventEmitter = require('events');
const OpenAPIValidator = require('openapi-schema-validator').default;
const { createUser, destroy, setup } = require('./helpers/setup');

test.before(async t => {
    t.context.server = await setup();
    t.context.userObj = await createUser(t.context.server);
});

test.after.always(async t => {
    await destroy(...Object.values(t.context.userObj));
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
    t.is(res.headers.location, '/v3');
});

test('Events should be available', t => {
    t.true(t.context.server.app.events instanceof EventEmitter);
    t.is(typeof t.context.server.app.event, 'object');
});

test('CSRF check is skipped for requests authenticated with a token', async t => {
    const { user, token } = t.context.userObj;

    const res = await t.context.server.inject({
        method: 'DELETE',
        url: `/v3/me`,
        headers: {
            authorization: `Bearer ${token}`
        },
        payload: {
            email: user.email,
            password: 'test-password'
        }
    });

    t.is(res.statusCode, 204);
});

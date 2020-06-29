const test = require('ava');

const { setup } = require('../../../test/helpers/setup');

test.before(async t => {
    const { server, models, getUser, getCredentials, addToCleanup, getTeamWithUser } = await setup({
        usePlugins: false
    });

    t.context.server = server;

    const { user, session, token } = await getUser();
    t.context.user = user;
    t.context.session = session.id;
    t.context.token = token;
    t.context.models = models;
    t.context.getUser = getUser;
    t.context.getTeamWithUser = getTeamWithUser;
    t.context.getCredentials = getCredentials;
    t.context.addToCleanup = addToCleanup;
});

test('Login tokens cannot be created by unactivated user', async t => {});

test('Login token can be created', async t => {});

test('Login token with chart ID can be created', async t => {});

test('Login token with chart ID that user cannot edit cannot be created', async t => {});

test('Login token logs in the user', async t => {});

test('Invalid login token returns 404', async t => {});

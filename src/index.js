const Hapi = require('hapi');
const AuthBearer = require('hapi-auth-bearer-token');

const ORM = require('@datawrapper/orm');
const config = require('../config');

ORM.init(config);

const AuthCookie = require('./auth/cookieAuth');
const bearerValidation = require('./auth/bearerValidation');
const cookieValidation = require('./auth/cookieValidation');

const server = Hapi.server({
    port: 3000,
    host: 'localhost'
});

async function init() {
    await server.register({
        plugin: require('hapi-pino'),
        options: {
            prettyPrint: process.env.DEV,
            logEvents: ['request', 'onPostStart']
        }
    });

    await server.register([AuthCookie, AuthBearer]);

    server.auth.strategy('simple', 'bearer-access-token', {
        validate: bearerValidation
    });

    server.auth.strategy('session', 'cookie-auth', {
        validate: cookieValidation
    });

    server.auth.default('simple');

    server.route({
        method: 'GET',
        path: '/',
        config: {
            auth: {
                strategies: ['session', 'simple']
            }
        },
        handler: (request, h) => {
            return {
                info: 'successful authentication'
            };
        }
    });

    await server.start();
}

process.on('unhandledRejection', err => {
    console.error(err);
    process.exit(1);
});

init();

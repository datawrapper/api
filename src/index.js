#! /usr/bin/env node
const Hapi = require('hapi');
const AuthBearer = require('hapi-auth-bearer-token');
const HapiSwagger = require('hapi-swagger');
const findUp = require('find-up');
const ORM = require('@datawrapper/orm');

const pkg = require('../package.json');

const configPath = findUp.sync('config.js');
const config = require(configPath);

ORM.init(config);

const AuthCookie = require('./auth/cookieAuth');
const AuthAdmin = require('./auth/adminAuth');
const bearerValidation = require('./auth/bearerValidation');
const cookieValidation = require('./auth/cookieValidation');

const LoadPlugins = require('./plugin-loader');

const Routes = require('./routes');

const OpenAPI = {
    plugin: HapiSwagger,
    options: {
        info: {
            title: 'Datawrapper API v3 Documentation',
            version: pkg.version,
            'x-info': process.env.DEV
                ? {
                      node: process.version,
                      hapi: pkg.dependencies.hapi
                  }
                : undefined
        },
        jsonPath: '/open-api.json',
        basePath: '/v3/',
        documentationPage: false,
        swaggerUI: false
    }
};

const server = Hapi.server({
    port: config.api.port || 3000,
    host: config.api.domain,
    tls: config.api.https,
    router: { stripTrailingSlash: true },
    routes: {
        cors: {
            origin: ['*'],
            credentials: true
        }
    }
});

async function init() {
    await server.register({
        plugin: require('hapi-pino'),
        options: {
            prettyPrint: process.env.DEV,
            logEvents: ['request', 'response', 'onPostStart', 'onPostStop'],
            redact: ['req.headers.authorization']
        }
    });

    await server.register([AuthCookie, AuthBearer, AuthAdmin]);

    server.auth.strategy('simple', 'bearer-access-token', {
        validate: bearerValidation
    });

    server.auth.strategy('session', 'cookie-auth', {
        validate: cookieValidation
    });

    server.auth.strategy('admin', 'admin-auth');

    server.auth.default('simple');

    await server.register([OpenAPI, Routes, LoadPlugins], { routes: { prefix: '/v3' } });

    server.ext('onRequest', (request, h) => {
        const { pathname } = request.url;
        if (pathname.startsWith('/3')) {
            request.setUrl(pathname.replace('/3', '/v3'));
        }
        return h.continue;
    });

    await server.start();
}

process.on('unhandledRejection', err => {
    console.error(err);
    process.exit(1);
});

init();

#! /usr/bin/env node
const Hapi = require('hapi');
const HapiSwagger = require('hapi-swagger');
const findUp = require('find-up');
const ORM = require('@datawrapper/orm');

const pkg = require('../package.json');

const configPath = findUp.sync('config.js');
const config = require(configPath);

ORM.init(config);

const DWAuth = require('./auth/dw-auth');

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
        jsonPath: '/',
        basePath: '/v3/',
        documentationPage: !!process.env.DEV,
        swaggerUI: !!process.env.DEV
    }
};

const server = Hapi.server({
    port: config.api.port || 3000,
    host: config.api.subdomain ? `${config.api.subdomain}.${config.api.domain}` : config.api.domain,
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
    if (process.env.NODE_ENV !== 'test') {
        await server.register({
            plugin: require('hapi-pino'),
            options: {
                prettyPrint: process.env.DEV,
                logEvents: ['request', 'response', 'onPostStart', 'onPostStop'],
                redact: !process.env.DEV && [
                    'req.headers.authorization',
                    'req.headers.cookie',
                    'res.headers["set-cookie"]'
                ]
            }
        });
    }

    if (process.env.DEV) {
        server.register([require('inert'), require('vision')]);
    }

    await server.register(DWAuth);

    server.auth.strategy('simple', 'dw-auth');

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

module.exports = server;

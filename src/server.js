const Hapi = require('hapi');
const HapiSwagger = require('hapi-swagger');
const findUp = require('find-up');
const get = require('lodash/get');
const ORM = require('@datawrapper/orm');

const pkg = require('../package.json');

const configPath = findUp.sync('config.js');
const config = require(configPath);

const { validate } = require('./config-schema');
validate(config);

const host = config.api.subdomain
    ? `${config.api.subdomain}.${config.api.domain}`
    : config.api.domain;

const OpenAPI = {
    plugin: HapiSwagger,
    options: {
        host,
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
    address: 'localhost',
    port: config.api.port || 3000,
    host,
    tls: config.api.https,
    router: { stripTrailingSlash: true },
    routes: {
        cors: {
            origin: ['*'],
            credentials: true
        }
    }
});

async function configure() {
    await server.register({
        plugin: require('hapi-pino'),
        options: {
            prettyPrint: true,
            timestamp: () => `,"time":"${new Date().toISOString()}"`,
            logEvents: ['request', 'onPostStart', 'onPostStop'],
            base: { name: pkg.version },
            redact: !process.env.DEV && [
                'req.headers.authorization',
                'req.headers.cookie',
                'res.headers["set-cookie"]'
            ]
        }
    });

    server.logger().info({ file: configPath, config }, '[Initialize] config.js');

    await ORM.init(config);

    if (process.env.DEV) {
        server.register([require('inert'), require('vision')]);
    }

    await server.register(require('./auth/dw-auth'));

    server.auth.strategy('simple', 'dw-auth');

    server.auth.default('simple');

    await server.register([OpenAPI, require('./routes'), require('./plugin-loader')], {
        routes: { prefix: '/v3' }
    });

    server.ext('onRequest', (request, h) => {
        const { pathname = '' } = get(request, 'url', {});
        if (pathname.startsWith('/3')) {
            request.setUrl(pathname.replace('/3', '/v3'));
        }
        return h.continue;
    });
}

process.on('unhandledRejection', err => {
    console.error(err);
    process.exit(1);
});

async function init() {
    await configure();
    server.initialize();

    return server;
}

async function start() {
    await configure();
    server.start();

    return server;
}

module.exports = { init, start };

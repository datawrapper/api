const Hapi = require('hapi');
const Boom = require('boom');
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
            'x-info':
                process.env.NODE_ENV === 'development'
                    ? {
                          node: process.version,
                          hapi: pkg.dependencies.hapi
                      }
                    : undefined
        },
        jsonPath: '/',
        basePath: '/v3/',
        documentationPage: process.env.NODE_ENV === 'development',
        swaggerUI: process.env.NODE_ENV === 'development'
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

async function configure(options = { usePlugins: true, useOpenAPI: true }) {
    await server.register({
        plugin: require('hapi-pino'),
        options: {
            prettyPrint: true,
            timestamp: () => `,"time":"${new Date().toISOString()}"`,
            logEvents: ['request', 'log', 'onPostStart', 'onPostStop'],
            base: { name: pkg.version },
            redact: process.env.NODE_ENV === 'development' && [
                'req.headers.authorization',
                'req.headers.cookie',
                'res.headers["set-cookie"]'
            ]
        }
    });

    server.logger().info({ file: configPath, config }, '[Initialize] config.js');

    await ORM.init(config);

    if (process.env.NODE_ENV === 'development') {
        server.register([require('inert'), require('vision')]);
    }

    await server.register(require('./auth/dw-auth'));

    server.auth.strategy('simple', 'dw-auth');
    server.auth.default('simple');

    const routeOptions = {
        routes: { prefix: '/v3' }
    };

    if (options.useOpenAPI) {
        await server.register(OpenAPI, routeOptions);
    }

    if (options.usePlugins) {
        await server.register([require('./plugin-loader')], routeOptions);
    }

    await server.register([require('./routes')], routeOptions);

    server.route({
        method: '*',
        path: '/{p*}',
        options: {
            auth: false
        },
        handler: (request, h) => {
            const { pathname = '' } = get(request, 'url', {});
            if (pathname.startsWith('/3')) {
                return h.redirect(pathname.replace('/3', '/v3')).permanent();
            }

            return Boom.notFound();
        }
    });
}

process.on('unhandledRejection', err => {
    console.error(err);
    process.exit(1);
});

async function init(options) {
    await configure(options);
    server.initialize();

    return server;
}

async function start() {
    await configure();
    server.start();

    return server;
}

module.exports = { init, start };

const Hapi = require('@hapi/hapi');
const Boom = require('@hapi/boom');
const HapiSwagger = require('hapi-swagger');
const get = require('lodash/get');
const ORM = require('@datawrapper/orm');
const { validateAPI, validateORM, validateFrontend } = require('@datawrapper/schemas/config');
const schemas = require('@datawrapper/schemas');
const { findConfigPath } = require('@datawrapper/shared/node/findConfig');

const { generateToken } = require('./utils');
const { ApiEventEmitter, eventList } = require('./utils/events');

const pkg = require('../package.json');
const configPath = findConfigPath();
const config = require(configPath);

validateAPI(config.api);
validateORM(config.orm);
validateFrontend(config.frontend);

const host = config.api.subdomain
    ? `${config.api.subdomain}.${config.api.domain}`
    : config.api.domain;

const port = config.api.port || 3000;

const OpenAPI = {
    plugin: HapiSwagger,
    options: {
        debug: process.env.NODE_ENV === 'development',
        host: process.env.NODE_ENV === 'development' ? `${host}:${port}` : host,
        schemes: process.env.NODE_ENV === 'development' ? ['http'] : ['https'],
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
        sortPaths: 'path-method',
        jsonPath: '/',
        basePath: '/v3/',
        documentationPage: process.env.NODE_ENV === 'development',
        swaggerUI: process.env.NODE_ENV === 'development',
        deReference: true
    }
};

const server = Hapi.server({
    host: 'localhost',
    address: '0.0.0.0',
    port,
    tls: config.api.https,
    router: { stripTrailingSlash: true },
    /* https://hapijs.com/api#-serveroptionsdebug */
    debug: process.env.NODE_ENV === 'development' ? { request: ['implementation'] } : false,
    routes: {
        cors: {
            origin: config.api.cors,
            credentials: true
        }
    }
});

function getLogLevel() {
    switch (process.env.NODE_ENV) {
        case 'development':
            return 'debug';
        case 'test':
            return 'error';
        default:
            return 'info';
    }
}

async function getVersionInfo() {
    const { version } = pkg;
    const { COMMIT } = process.env;
    if (COMMIT) {
        return { commit: COMMIT, version: `${version} (${COMMIT})` };
    }

    try {
        const { promisify } = require('util');
        const exec = promisify(require('child_process').exec);
        const { stdout } = await exec('git rev-parse --short HEAD');
        const commit = stdout.trim();
        return { commit, version: `${version} (${commit})` };
    } catch (error) {
        return { version };
    }
}

async function configure(options = { usePlugins: true, useOpenAPI: true }) {
    const { commit, version } = await getVersionInfo();
    await server.register({
        plugin: require('hapi-pino'),
        options: {
            prettyPrint: true,
            timestamp: () => `,"time":"${new Date().toISOString()}"`,
            logEvents: ['request', 'log', 'onPostStart', 'onPostStop', 'request-error'],
            level: getLogLevel(),
            base: { name: commit || version },
            redact: process.env.NODE_ENV !== 'development' && [
                'req.headers.authorization',
                'req.headers.cookie',
                'res.headers["set-cookie"]'
            ]
        }
    });

    server.logger().info(
        {
            VERSION: version,
            CONFIG_FILE: configPath,
            NODE_ENV: process.env.NODE_ENV,
            NODE_VERSION: process.version,
            PID: process.pid
        },
        '[Initialize] Starting server ...'
    );

    await ORM.init(config);
    /* register api plugins with core db */
    require('@datawrapper/orm/models/Plugin').register(
        'datawrapper-api',
        Object.keys(config.plugins)
    );

    server.app.event = eventList;
    server.app.events = new ApiEventEmitter({ logger: server.logger });
    server.app.visualization = new Set();

    server.method('config', key => (key ? config[key] : config));
    server.method('generateToken', generateToken);
    server.method('logAction', require('@datawrapper/orm/utils/action').logAction);

    const { validateThemeData } = schemas.initialize({
        getSchema: config.api.schemaBaseUrl
            ? loadSchemaFromUrl(config.api.schemaBaseUrl)
            : undefined
    });
    server.method('validateThemeData', validateThemeData);

    if (process.env.NODE_ENV === 'development') {
        server.register([require('@hapi/inert'), require('@hapi/vision')]);
    }

    await server.register(require('./auth/dw-auth'));

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

    if (process.argv.includes('--check') || process.argv.includes('-c')) {
        server.logger().info("\n\n[Check successful] The server shouldn't crash on startup");
        process.exit(0);
    }

    server.start();

    return server;
}

function loadSchemaFromUrl(baseUrl) {
    const got = require('got');
    const cache = {};
    return async id => {
        // use cached schema if available
        if (cache[id]) return cache[id];
        // fetch schema from URL
        const body = await got(`${id}.json`, { prefixUrl: baseUrl }).json();
        cache[id] = body;
        // delete cache after 5 minutes
        setTimeout(() => {
            delete cache[id];
        }, 5 * 6e4);

        return body;
    };
}

module.exports = { init, start };

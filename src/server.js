const Hapi = require('@hapi/hapi');
const Boom = require('@hapi/boom');
const HapiSwagger = require('hapi-swagger');
const get = require('lodash/get');
const ORM = require('@datawrapper/orm');
const fs = require('fs');
const path = require('path');
const { validateAPI, validateORM, validateFrontend } = require('@datawrapper/shared/configSchema');

const { generateToken } = require('./utils');
const { ApiEventEmitter, eventList } = require('./utils/events');

const pkg = require('../package.json');

const configPath = [path.join(process.cwd(), 'config.js'), '/etc/datawrapper/config.js'].reduce(
    (path, test) => path || (fs.existsSync(test) ? test : undefined),
    ''
);

if (!configPath) {
    process.stderr.write(`
❌ No config.js found!

Not starting the API server.
Please check if there is a \`config.js\` file in either

\`/etc/datawrapper\` or \`${path.join(process.cwd(), 'config.js')}\`

https://github.com/datawrapper/api#configuration

`);

    process.exit(1);
}

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
        host: process.env.NODE_ENV === 'development' ? `${host}:${port}` : host,
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
    host: 'localhost',
    address: '0.0.0.0',
    port,
    tls: config.api.https,
    router: { stripTrailingSlash: true },
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

async function configure(options = { usePlugins: true, useOpenAPI: true }) {
    await server.register({
        plugin: require('hapi-pino'),
        options: {
            prettyPrint: true,
            timestamp: () => `,"time":"${new Date().toISOString()}"`,
            logEvents: ['request', 'log', 'onPostStart', 'onPostStop', 'request-error'],
            level: getLogLevel(),
            base: { name: pkg.version },
            redact: process.env.NODE_ENV !== 'development' && [
                'req.headers.authorization',
                'req.headers.cookie',
                'res.headers["set-cookie"]'
            ]
        }
    });

    server.logger().info({ file: configPath }, '[Initialize] config.js');

    await ORM.init(config);
    /* register api plugins with core db */
    require('@datawrapper/orm/models/Plugin').register(
        'datawrapper-api',
        Object.keys(config.plugins)
    );

    server.app.event = eventList;
    server.app.events = new ApiEventEmitter({ logger: server.logger });

    server.method('config', key => (key ? config[key] : config));
    server.method('generateToken', generateToken);

    if (process.env.NODE_ENV === 'development') {
        server.register([require('@hapi/inert'), require('@hapi/vision')]);
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

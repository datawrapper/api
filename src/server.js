const Hapi = require('@hapi/hapi');
const Boom = require('@hapi/boom');
const Joi = require('@hapi/joi');
const HapiSwagger = require('hapi-swagger');
const get = require('lodash/get');
const ORM = require('@datawrapper/orm');
const fs = require('fs-extra');
const path = require('path');
const { validateAPI, validateORM, validateFrontend } = require('@datawrapper/schemas/config');
const schemas = require('@datawrapper/schemas');
const { findConfigPath } = require('@datawrapper/shared/node/findConfig');

const CodedError = require('@datawrapper/shared/CodedError');

const { generateToken } = require('./utils');
const { addScope } = require('./utils/l10n');
const { ApiEventEmitter, eventList } = require('./utils/events');

const pkg = require('../package.json');
const configPath = findConfigPath();
const config = require(configPath);

const DW_DEV_MODE = JSON.parse(process.env.DW_DEV_MODE || 'false');

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
        debug: DW_DEV_MODE,
        host: DW_DEV_MODE ? `${host}:${port}` : host,
        schemes: DW_DEV_MODE ? ['http'] : ['https'],
        info: {
            title: 'Datawrapper API v3 Documentation',
            version: pkg.version,
            'x-info': DW_DEV_MODE
                ? {
                      node: process.version,
                      hapi: pkg.dependencies.hapi
                  }
                : undefined
        },
        sortPaths: 'path-method',
        jsonPath: '/',
        basePath: '/v3/',
        documentationPage: DW_DEV_MODE,
        swaggerUI: DW_DEV_MODE,
        deReference: true
    }
};

const server = Hapi.server({
    host: 'localhost',
    address: '0.0.0.0',
    port,
    tls: false,
    router: { stripTrailingSlash: true },
    /* https://hapijs.com/api#-serveroptionsdebug */
    debug: DW_DEV_MODE ? { request: ['implementation'] } : false,
    routes: {
        cors: {
            origin: config.api.cors,
            credentials: true
        },
        validate: {
            async failAction(request, h, err) {
                throw Boom.badRequest('Invalid request payload input: ' + err.message);
            }
        }
    }
});

function getLogLevel() {
    if (DW_DEV_MODE) {
        return 'debug';
    }

    switch (process.env.NODE_ENV) {
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
            redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]']
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

    // load translations
    try {
        const localePath = path.join(__dirname, '../locale');
        const localeFiles = await fs.readdir(localePath);
        const locales = {};
        for (let i = 0; i < localeFiles.length; i++) {
            const file = localeFiles[i];
            if (/[a-z]+_[a-z]+\.json/i.test(file)) {
                locales[file.split('.')[0]] = JSON.parse(
                    await fs.readFile(path.join(localePath, file))
                );
            }
        }
        addScope('core', locales);
    } catch (e) {}

    await ORM.init(config);
    await ORM.registerPlugins();

    /* register api plugins with core db */
    require('@datawrapper/orm/models/Plugin').register(
        'datawrapper-api',
        Object.keys(config.plugins)
    );

    server.validator(Joi);

    server.app.event = eventList;
    server.app.events = new ApiEventEmitter({ logger: server.logger });
    server.app.visualizations = new Map();
    server.app.exportFormats = new Set();
    server.app.scopes = new Set();
    server.app.adminScopes = new Set();

    server.method('getModel', name => ORM.db.models[name]);
    server.method('config', key => (key ? config[key] : config));
    server.method('generateToken', generateToken);
    server.method('logAction', require('@datawrapper/orm/utils/action').logAction);
    server.method('createChartWebsite', require('./publish/create-chart-website.js'));
    server.method('registerVisualization', function(plugin, visualizations = []) {
        visualizations.forEach(vis => {
            const visualization = server.app.visualizations.get(vis.id);

            if (visualization) {
                server
                    .logger()
                    .warn(
                        { status: 'skipping', registeredBy: plugin },
                        `[Visualization] "${vis.id}" already registered.`
                    );
                return;
            }

            vis.__plugin = plugin;
            vis.libraries = vis.libraries || [];
            server.app.visualizations.set(vis.id, vis);
        });
    });
    server.method('getScopes', (admin = false) => {
        return admin
            ? [...server.app.scopes, ...server.app.adminScopes]
            : Array.from(server.app.scopes);
    });

    const { validateThemeData } = schemas.initialize({
        getSchema: config.api.schemaBaseUrl
            ? loadSchemaFromUrl(config.api.schemaBaseUrl)
            : undefined
    });
    server.method('validateThemeData', validateThemeData);

    if (DW_DEV_MODE) {
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

    const { events, event } = server.app;
    const { general, frontend } = server.methods.config();
    const { localChartAssetRoot } = general;
    const registeredEvents = events.eventNames();
    const hasRegisteredDataPlugins =
        registeredEvents.includes(event.GET_CHART_ASSET) &&
        registeredEvents.includes(event.PUT_CHART_ASSET);

    if (localChartAssetRoot === undefined && !hasRegisteredDataPlugins) {
        server
            .logger()
            .error(
                '[Config] You need to configure `general.localChartAssetRoot` or install a plugin that implements chart asset storage.'
            );
        process.exit(1);
    }

    if (!hasRegisteredDataPlugins) {
        events.on(event.GET_CHART_ASSET, async function({ chart, filename }) {
            const filePath = path.join(localChartAssetRoot, getDataPath(chart.createdAt), filename);
            try {
                await fs.access(filePath, fs.constants.R_OK);
            } catch (e) {
                throw new CodedError('notFound', 'chart asset not found');
            }
            return fs.createReadStream(filePath);
        });

        events.on(event.PUT_CHART_ASSET, async function({ chart, data, filename }) {
            const outPath = path.join(localChartAssetRoot, getDataPath(chart.createdAt));

            await fs.mkdir(outPath, { recursive: true });
            await fs.writeFile(path.join(outPath, filename), data);
            return { code: 204 };
        });
    }

    const hasRegisteredPublishPlugin = registeredEvents.includes(event.PUBLISH_CHART);

    if (general.localChartPublishRoot === undefined && !hasRegisteredPublishPlugin) {
        server
            .logger()
            .error(
                '[Config] You need to configure `general.localChartPublishRoot` or install a plugin that implements chart publication.'
            );
        process.exit(1);
    }

    if (!hasRegisteredPublishPlugin) {
        const protocol = frontend.https ? 'https' : 'http';
        events.on(event.PUBLISH_CHART, async ({ chart, outDir, fileMap }) => {
            const dest = path.resolve(general.localChartPublishRoot, chart.publicId);

            for (const file of fileMap) {
                const basename = path.basename(file);
                const dir = path.dirname(file);

                const out =
                    dir === '.'
                        ? path.resolve(dest, basename)
                        : path.resolve(dest, '..', dir, basename);

                await fs.copy(path.join(outDir, basename), out, { overwrite: dir === '.' });
            }

            await fs.remove(outDir);

            return `${protocol}://${general.chart_domain}/${chart.publicId}`;
        });
    }

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

    setTimeout(() => {
        if (process.send) {
            server.logger().info('sending READY signal to pm2');
            process.send('ready');
        }
    }, 100);

    process.on('SIGINT', async function() {
        server.logger().info('received SIGINT signal, closing all connections...');
        await server.stop();
        server.logger().info('server has stopped');
        process.exit(0);
    });

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

function getDataPath(date) {
    const year = date.getUTCFullYear();
    const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
    return `${year}${month}`;
}

module.exports = { init, start };

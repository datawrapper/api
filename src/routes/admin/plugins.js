const stream = require('stream');
const fs = require('fs-extra');
const path = require('path');
const { promisify } = require('util');
const Joi = require('@hapi/joi');
const Boom = require('@hapi/boom');
const get = require('lodash/get');
const intersection = require('lodash/intersection');
const got = require('got');
const tar = require('tar');

const pipeline = promisify(stream.pipeline);

function getNormalizedName(str) {
    const match = /(?:.*plugin-)?(.*)/.exec(str);
    return match ? match[1] : undefined;
}

module.exports = {
    name: 'routes/admin/plugins',
    version: '1.0.0',
    register
};

function register(server, options) {
    // GET /v3/admin/plugins
    server.route({
        method: 'GET',
        path: '/',
        options: {
            auth: 'admin'
        },
        handler: getAllPlugins
    });

    async function getAllPlugins(request, h) {
        const plugins = [];
        const config = request.server.methods.config();

        for (const [plugin, { version }] of Object.entries(request.server.registrations)) {
            if (config.plugins[getNormalizedName(plugin)]) {
                plugins.push({
                    plugin,
                    version
                });
            }
        }

        return { list: plugins, count: plugins.length };
    }

    // POST /v3/admin/plugins/update
    server.route({
        method: 'POST',
        path: '/update',
        options: {
            auth: 'admin',
            validate: {
                payload: {
                    name: Joi.string().required(),
                    branch: Joi.string().default('master')
                }
            }
        },
        handler: updatePlugin
    });

    async function updatePlugin(request, h) {
        const { server, payload, auth } = request;
        const registration = server.registrations[payload.name];
        const { api, general, plugins } = server.methods.config();
        const log = server.logger();

        const name = getNormalizedName(payload.name);

        if (!plugins[name]) {
            return Boom.notFound();
        }

        if (!api.githubToken) {
            return Boom.notImplemented('github-token-not-configured');
        }

        const tarball = get(registration, 'options.tarball');
        if (!tarball) {
            return Boom.notImplemented();
        }

        const pluginLocation = path.join(general.localPluginRoot, name);
        const backupFile = path.join(general.localPluginRoot, `${name}-backup.tgz`);

        const dir = await fs.readdir(pluginLocation);

        /* Find directories to update */
        const staticDirectories = intersection(dir, [
            'less',
            'locale',
            'static'
        ]); /* is this all?  */

        if (!staticDirectories.length) {
            return h.response().code(204);
        }

        request.logger.info({ user: auth.artifacts.id }, '[Start] Backup plugin', payload.name);

        /* Create backup of current local directories */
        await tar.create(
            {
                cwd: pluginLocation,
                gzip: true,
                file: backupFile
            },
            staticDirectories
        );

        log.info('[Done] Backup plugin', payload.name);
        log.info('[Start] Update plugin', payload.name);

        /* Download repo archive from Github and pipe it into node-tar to extract directories */
        const staticDirectoriesRegex = new RegExp(`.*/(${staticDirectories.join('|')})/.*`);
        const url = `${tarball}/${payload.branch}`;
        try {
            await pipeline(
                got.stream(url, {
                    headers: {
                        authorization: `token ${api.githubToken}`
                    }
                }),
                tar.extract({
                    cwd: pluginLocation,
                    strip: 1,
                    filter: path => staticDirectoriesRegex.test(path)
                })
            );
        } catch (error) {
            if (error.name === 'HTTPError') {
                log.error({ url }, error.message);
                return Boom.badGateway(`(${error.name}) ${error.message} [${url}]`);
            }
            log.error(error);
            log.info('[Failed] Update plugin', payload.name);

            log.info('[Start] Restoring backup', payload.name);

            await tar.extract({
                cwd: pluginLocation,
                file: backupFile,
                filter: path => staticDirectoriesRegex.test(path)
            });

            log.info('[Done] Restoring backup', payload.name);

            return Boom.badGateway();
        }

        log.info('[Done] Update plugin', payload.name);
        return h.response().code(204);
    }
}

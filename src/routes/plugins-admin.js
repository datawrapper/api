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

module.exports = {
    name: 'admin-plugin-routes',
    version: '1.0.0',
    register
};

function register(server, options) {
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
        for (const [plugin, { version, options }] of Object.entries(request.server.registrations)) {
            if (get(options, 'tarball') && get(options, 'reload')) {
                plugins.push({
                    plugin,
                    version
                });
            }
        }

        return { list: plugins, count: plugins.length };
    }

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
        const { api, general } = server.methods.config();
        const log = server.logger();

        if (!registration) {
            return Boom.notFound();
        }

        const tarball = get(registration, 'options.tarball');
        if (!get(registration, 'options.reload') || !tarball) {
            return Boom.notImplemented();
        }

        const pluginLocation = path.join(general.localPluginRoot, payload.name);
        const backupFile = path.join(general.localPluginRoot, `${payload.name}-backup.tgz`);

        const dir = await fs.readdir(pluginLocation);

        /* Find directories to update */
        const staticDirectories = intersection(dir, [
            'less',
            'locale',
            'static'
        ]); /* is this all?  */

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
                return Boom.badGateway();
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

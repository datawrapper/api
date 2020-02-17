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
            if (options && options.tarball && options.config && options.config.reload) {
                plugins.push({
                    plugin,
                    version,
                    url: `/v3/admin/plugins/${plugin}`
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

        if (!registration) {
            return Boom.notFound();
        }

        const tarball = get(registration, 'options.tarball');
        if (!get(registration, 'options.config.reload') || !tarball) {
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

        server.logger().info('[Done] Backup plugin', payload.name);
        server.logger().info('[Start] Update plugin', payload.name);

        /* Download repo archive from Github and pipe it into node-tar to extract directories */
        const staticDirectoriesRegex = new RegExp(`.*/(${staticDirectories.join('|')})/.*`);
        await pipeline(
            got.stream(`${tarball}/${payload.branch}`, {
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

        server.logger().info('[Done] Update plugin', payload.name);

        return h.response().code(204);
    }
}

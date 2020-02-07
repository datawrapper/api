const stream = require('stream');
const fs = require('fs-extra');
const path = require('path');
const { promisify } = require('util');
const Boom = require('@hapi/boom');
const get = require('lodash/get');
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
        path: '/{name}',
        options: {
            auth: 'admin'
        },
        handler: updatePlugin
    });

    async function updatePlugin(request, h) {
        const { server, params, auth } = request;
        const registration = server.registrations[params.name];
        const { api, general } = server.methods.config();

        if (!registration) {
            return Boom.notFound();
        }

        const tarball = get(registration, 'options.tarball');
        if (!get(registration, 'options.config.reload') || !tarball) {
            return Boom.notImplemented();
        }

        const destination = path.join(general.localPluginRoot, params.name);
        const backupDestination = path.join(general.localPluginRoot, `${params.name}-backup`);

        request.logger.info({ user: auth.artifacts.id }, '[Start] Backup plugin', params.name);
        await fs.copy(destination, backupDestination, {
            filter: src => {
                return !src.includes('node_modules/');
            }
        });
        server.logger().info('[Done] Backup plugin', params.name);
        server.logger().info('[Start] Update plugin', params.name);

        await pipeline(
            got.stream(`${tarball}/node-publishing`, {
                headers: {
                    authorization: `token ${api.githubToken}`
                }
            }),
            tar.extract({ C: destination, strip: 1 })
        );
        server.logger().info('[Done] Update plugin', params.name);

        return h.response().code(204);
    }
}

const fs = require('fs-extra');
const path = require('path');
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);
const Joi = require('@hapi/joi');
const Boom = require('@hapi/boom');
const { Theme } = require('@datawrapper/orm/models');

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
    server.app.adminScopes.add('plugin:read');
    server.app.adminScopes.add('plugin:write');

    const styleCache = server.cache({ segment: 'vis-styles', shared: true });

    // GET /v3/admin/plugins
    server.route({
        method: 'GET',
        path: '/',
        options: {
            auth: {
                strategy: 'admin',
                access: { scope: ['plugin:read'] }
            }
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
            auth: {
                strategy: 'admin',
                access: { scope: ['plugin:write'] }
            },
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
        const { server, payload } = request;
        const { general, plugins } = server.methods.config();
        const log = server.logger();

        const name = getNormalizedName(payload.name);

        if (!plugins[name]) {
            return Boom.notFound();
        }

        const pluginLocation = path.join(general.localPluginRoot, name);
        const isGitRepo = await fs.pathExists(path.join(pluginLocation, '.git/index'));
        if (!isGitRepo) {
            return Boom.notImplemented(
                "Cannot update plugins which aren't git repos (or not installed yet)"
            );
        }
        // if the plugin is a git repo we update it using git pull
        // get current branch
        const branch = payload.branch;
        const result = [`Updating plugin ${name} from branch origin/${branch}`];
        const { stdout: oldCommit } = await exec(
            'git log --pretty=format:"#%h: %s (%an, %ar)" -1',
            { cwd: pluginLocation }
        );
        result.push(`Plugin is at commit:\n${oldCommit}`);
        result.push('git fetch origin');
        // fetch all updates from origin
        await exec('git fetch origin', { cwd: pluginLocation });
        // reset local repo to latest origin branch
        const gitResetCmd = `git reset --hard origin/${branch}`;
        result.push(gitResetCmd);
        const { stdout: gitResetOut } = await exec(gitResetCmd, { cwd: pluginLocation });
        result.push(gitResetOut);

        /* bust visualization css cache */
        const visualizations = [];
        for (const [key, value] of server.app.visualizations) {
            if (value.__plugin === name) visualizations.push(key);
        }

        const themes = await Theme.findAll({ attributes: ['id'] });

        const dropOperationPromises = [];
        const droppedCacheKeys = [];
        for (const vis of visualizations) {
            for (const { id } of themes) {
                const promise = styleCache.drop(`${id}__${vis}`).catch(() => {
                    server.logger().info(`Unable to drop cache key [${id}__${vis}]`);
                });
                droppedCacheKeys.push(`${id}__${vis}`);
                dropOperationPromises.push(promise);
            }
        }

        await Promise.all(dropOperationPromises);

        result.push(
            `Dropped ${droppedCacheKeys.length} cache keys (e.g., ${droppedCacheKeys
                .slice(0, 3)
                .join(', ')})`
        );

        log.info('[Done] Update plugin', payload.name);
        return { log: result.join('\n') };
    }
}

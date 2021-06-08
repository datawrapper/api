const fs = require('fs-extra');
const path = require('path');
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);
const Joi = require('joi');
const Boom = require('@hapi/boom');
const { Theme } = require('@datawrapper/orm/models');
const some = require('lodash/some');
const isEqual = require('lodash/isEqual');

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
        const log = server.logger;

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
        const cwd = pluginLocation;
        const result = [`Updating plugin ${name} from branch origin/${branch}`];
        const { stdout: oldCommit } = await exec(
            'git log --pretty=format:"#%h: %s (%an, %ar)" -1',
            { cwd }
        );
        result.push(`Plugin is at commit:\n${oldCommit}\n`);
        result.push('git fetch origin');
        // get list of files that have changed
        const changedFiles = (
            await exec(`git diff --name-only origin/${branch} ${branch}`, { cwd })
        ).stdout.split('\n');
        let needsPm2Reload = some(
            [
                'api.js',
                'crons.js',
                'frontend.js',
                /^src\/api\//,
                /^src\/crons\//,
                /^src\/frontend\/$/
            ],
            file =>
                typeof file === 'string'
                    ? changedFiles.includes(file) // exact file name match
                    : some(changedFiles, f => file.test(f)) // regex pattern match
        );
        if (changedFiles.includes('package.json')) {
            // compare old package.json with new one to see
            // if the dependencies have changed
            const hasPackageJSON = await fs.pathExists(path.join(pluginLocation, 'package.json'));
            if (!hasPackageJSON) needsPm2Reload = true;
            else {
                const { dependencies: oldDeps } = JSON.parse(
                    await fs.read(path.join(pluginLocation, 'package.json'))
                );
                const { dependencies: newDeps } = JSON.parse(
                    (await exec(`git show origin/${branch}:package.json`, { cwd })) || '{}'
                );
                if (!isEqual(oldDeps, newDeps)) {
                    needsPm2Reload = true;
                }
            }
        }
        if (needsPm2Reload) {
            return Boom.notImplemented(
                'This plugin update requires reloading the APi, which must be done manually on the server.'
            );
        }
        // fetch all updates from origin
        await exec('git fetch origin', { cwd });
        // reset local repo to latest origin branch
        const gitResetCmd = `git reset --hard origin/${branch}`;
        result.push(gitResetCmd);
        const { stdout: gitResetOut } = await exec(gitResetCmd, { cwd });
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
                    server.logger.info(`Unable to drop cache key [${id}__${vis}]`);
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

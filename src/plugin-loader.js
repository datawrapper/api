/*
/src/plugins/{name}/index.js (file)

@datawrapper/plugin-* | dw-plugin-* (npm)
  /index.js
*/
const path = require('path');
const globby = require('globby');
const models = require('@datawrapper/orm/models');
const findUp = require('find-up');
const get = require('lodash/get');

const pkg = require(findUp.sync('package.json'));
const config = require(findUp.sync('config.js'));

async function loadPlugins(options) {
    const paths = await globby(['plugins/*/index.js']);

    const localPlugins = paths.map(p => {
        const plugin = require(path.join(process.cwd(), p));
        return {
            plugin,
            type: 'local',
            options: {
                models: options.models,
                config: get(config, ['plugins', plugin.name], {})
            }
        };
    });

    const npmPlugins = Object.keys(pkg.dependencies)
        .filter(dep => dep.includes('@datawrapper/plugin-') || dep.includes('dw-plugin'))
        .map(p => {
            const plugin = require(p);
            return {
                plugin,
                type: 'npm',
                options: {
                    models: options.models,
                    config: get(config, ['plugins', plugin.name], {})
                }
            };
        });

    return npmPlugins.concat(localPlugins);
}

module.exports = {
    name: 'plugin-loader',
    version: '1.0.0',
    register: async (server, options) => {
        const plugins = await loadPlugins({ models, config: config.plugins });

        if (plugins.length) {
            await server.register(plugins);
            plugins.forEach(({ plugin, type }) => {
                server.logger().info({ version: plugin.version, type }, `[Plugin] ${plugin.name}`);
            });
        }
    }
};

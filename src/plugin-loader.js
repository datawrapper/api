const glob = require('glob');
const models = require('@datawrapper/orm/models');
const findUp = require('find-up');
const get = require('lodash/get');

const pkg = require(findUp.sync('package.json'));

const localPluginPaths = glob.sync('plugins/*/index.js', { absolute: true });
const localPlugins = localPluginPaths.map(require);

function findPlugin(config) {
    return name => {
        const pluginObject = {
            options: {
                models,
                config: get(config, ['plugins', name], {})
            }
        };

        if (pkg.dependencies[name]) {
            pluginObject.plugin = require(name);
            pluginObject.type = 'npm';
        }

        const plugin = localPlugins.find(plugin => plugin.name === name);
        if (plugin) {
            pluginObject.plugin = plugin;
            pluginObject.type = 'local';
        }

        if (!pluginObject.plugin) {
            return {
                error: name
            };
        }

        return pluginObject;
    };
}

let loadingError = false;
module.exports = {
    name: 'plugin-loader',
    version: '1.0.0',
    register: async (server, options) => {
        const config = server.methods.config();
        const plugins = Object.keys(config.plugins || []).map(findPlugin(config));

        if (plugins.length) {
            plugins.forEach(({ plugin, type, error }) => {
                if (error) {
                    loadingError = true;
                    server.logger().error(`[Plugin] ${error}`, logError(error));
                } else {
                    server
                        .logger()
                        .info({ version: plugin.version, type }, `[Plugin] ${plugin.name}`);
                }
            });
            if (loadingError) process.exit(1);

            await server.register(plugins);
        }
    }
};

function logError(name) {
    return `

Loading plugin [${name}] failed! Maybe it is not properly installed.

Is it specified in "package.json" under "dependencies"?
    If it is, try running "npm install"

Is it available in "plugins/"?
    Tip: run "grep -r "${name}" plugins/*/index.js"
`;
}

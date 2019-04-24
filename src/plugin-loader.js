const path = require('path');
const models = require('@datawrapper/orm/models');
const get = require('lodash/get');

let loadingError = false;
module.exports = {
    name: 'plugin-loader',
    version: '1.0.0',
    register: async (server, options) => {
        const config = server.methods.config();
        const root = config.api.localPluginRoot || path.join(process.cwd(), 'plugins');

        const plugins = Object.keys(config.plugins || []).map(registerPlugin);

        function registerPlugin(name) {
            const plugin = require(root + '/' + name);

            const pluginObject = {
                plugin,
                type: 'local',
                options: {
                    models,
                    config: get(config, ['plugins', name], {})
                }
            };

            return pluginObject;
        }

        if (plugins.length) {
            plugins.forEach(({ plugin, type, error }) => {
                if (error) {
                    loadingError = true;
                    server.logger().error(`[Plugin] ${error}`, logError(error));
                } else {
                    server
                        .logger()
                        .info(
                            { version: plugin.version, type },
                            `[Plugin] ${get(plugin, ['pkg', 'name'], plugin.name)}`
                        );
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

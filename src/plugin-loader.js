const path = require('path');
const models = require('@datawrapper/orm/models');
const get = require('lodash/get');

module.exports = {
    name: 'plugin-loader',
    version: '1.0.0',
    register: async (server, options) => {
        const config = server.methods.config();
        const root = config.api.localPluginRoot || path.join(process.cwd(), 'plugins');

        const plugins = Object.keys(config.plugins || []).map(registerPlugin);

        function registerPlugin(name) {
            try {
                return {
                    plugin: require(path.join(root, name)),
                    options: {
                        models,
                        config: get(config, ['plugins', name], {})
                    }
                };
            } catch (error) {
                return { name, error };
            }
        }

        if (plugins.length) {
            plugins.forEach(({ plugin, options, error, name }) => {
                if (error) {
                    server.logger().error(`[Plugin] ${error}`, logError(root, name));
                    process.exit(1);
                } else {
                    server.logger().info(
                        {
                            version: get(plugin, ['pkg', 'version'], plugin.version),
                            config: options.config
                        },
                        `[Plugin] ${get(plugin, ['pkg', 'name'], plugin.name)}`
                    );
                }
            });

            await server.register(plugins);
        }
    }
};

function logError(root, name) {
    return `

Loading plugin [${name}] failed! Maybe it is not properly installed.

Is it available in "plugins/"?
    Tip: run "ls ${root} | grep "${name}"
Possible mistakes:
    * Plugin config key doesn't match the plugin folder.
    * Plugin is missing from ${root}.
    * Plugin has no \`index.js\` or package.json with "main" key.
`;
}

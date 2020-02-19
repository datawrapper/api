const path = require('path');
const models = require('@datawrapper/orm/models');
const get = require('lodash/get');

module.exports = {
    name: 'plugin-loader',
    version: '1.0.0',
    register: async (server, options) => {
        const config = server.methods.config();
        const root = config.general.localPluginRoot || path.join(process.cwd(), 'plugins');

        const plugins = Object.keys(config.plugins || []).map(registerPlugin);

        function registerPlugin(name) {
            try {
                const pluginPath = path.join(root, name, 'api.js');
                const { options = {}, ...plugin } = require(pluginPath);

                const { routes, ...opts } = options;
                return [
                    {
                        plugin,
                        options: {
                            models,
                            config: get(config, ['plugins', name], {}),
                            tarball: `https://api.github.com/repos/datawrapper/plugin-${name}/tarball`,
                            ...opts
                        }
                    },
                    { routes }
                ];
            } catch (error) {
                return [{ name, error }];
            }
        }

        if (plugins.length) {
            for (const [{ plugin, options, error, name }, pluginOptions] of plugins) {
                if (error) {
                    server.logger().error(`[Plugin] ${error}`, logError(root, name));
                    process.exit(1);
                } else {
                    server.logger().info(
                        {
                            version: get(plugin, ['pkg', 'version'], plugin.version)
                        },
                        `[Plugin] ${get(plugin, ['pkg', 'name'], plugin.name)}`
                    );

                    await server.register({ plugin, options }, pluginOptions);
                }
            }
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

const fs = require('fs');
const path = require('path');
const models = require('@datawrapper/orm/models');
const get = require('lodash/get');
const { promisify } = require('util');
const { addScope } = require('./utils/l10n');
const readFile = promisify(fs.readFile);
const readDir = promisify(fs.readdir);

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
                        name,
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
                    server.logger().warn(`[Plugin] ${name}`, logError(root, name, error));
                } else {
                    const version = get(plugin, ['pkg', 'version'], plugin.version);
                    server.logger().info(`[Plugin] ${name}@${version}`);
                    // try to load locales
                    try {
                        const localePath = path.join(root, name, 'locale');
                        const locales = await readDir(localePath);
                        options.locales = {};
                        for (let i = 0; i < locales.length; i++) {
                            const file = locales[i];
                            if (file === 'chart-translations.json') {
                                // chart translations are special because they need to be passed
                                // to the chart-core so they are availabe in rendered charts
                                addScope(
                                    'chart',
                                    JSON.parse(await readFile(path.join(localePath, file)))
                                );
                            } else if (/[a-z]+_[a-z]+\.json/i.test(file)) {
                                options.locales[file.split('.')[0]] = JSON.parse(
                                    await readFile(path.join(localePath, file))
                                );
                            }
                        }
                        addScope(name, options.locales);
                    } catch (e) {}
                    await server.register({ plugin, options }, pluginOptions);
                }
            }
        }
    }
};

function logError(root, name, error) {
    if (error.code === 'MODULE_NOT_FOUND') {
        return `- skipped
    Reason: \`api.js\` doesn't exist or a dependency is not installed.`;
    }

    return `

Loading plugin [${name}] failed! Maybe it is not properly installed.

Is it available in "plugins/"?
    Tip: run "ls ${root} | grep "${name}"
Possible mistakes:
    * Plugin config key doesn't match the plugin folder.
    * Plugin is missing from ${root}.

Maybe this error is helpful:
${error.stack}`;
}

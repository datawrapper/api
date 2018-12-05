const express = require('express');
const router = express.Router();

const getRouter = require('../lib/getRouter');
const config = require('../../config');
const models = require('@datawrapper/orm/models');

const requirePlugin = require('../lib/requirePlugin');

// load plugins
for (let pid of Object.keys(config.plugins)) {
    const [plugin_name, version] = pid.split('#');
    // load the plugin
    const plugin = require(`@datawrapper/plugin-${plugin_name}`);

    if (plugin && plugin.api) {

        let plugin_cfg = {};
        try {
            // load plugin default config
            plugin_cfg = require(`@datawrapper/plugin-${plugin_name}/config`)
        } catch (e) {
            console.log('no default config');
        }
        // extend default plugin cfg with our custom config
        Object.assign(plugin_cfg, config.plugins[pid]);

        // the plugin wants to define api routes
        const plugin_router = getRouter();

        plugin.api({ router: plugin_router, models, config: {
            global: config, plugin: plugin_cfg
        }});

        router.use(`/${plugin_name}`,
            requirePlugin(plugin_name),
            plugin_router);
    }
}

module.exports = router;

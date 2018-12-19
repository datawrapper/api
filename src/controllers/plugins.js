const express = require('express');
const router = express.Router();

const getRouter = require('../lib/getRouter');
const config = require('../../config');
const logger = require('../lib/logger');
const models = require('@datawrapper/orm/models');

const requirePlugin = require('../lib/requirePlugin');

// load plugins
for (let pid of Object.keys(config.plugins)) {
    const [plugin_name, version] = pid.split('@');
    // load the plugin
    let plugin;
    try {
        plugin = require(`@datawrapper/plugin-${plugin_name}`);
    } catch (e) {
        logger.error(`could not load the plugin ${plugin_name}. Try npm install...`);
    }

    if (plugin && plugin.api) {

        let plugin_cfg = {};
        try {
            // load plugin default config
            plugin_cfg = require(`@datawrapper/plugin-${plugin_name}/config`)
        } catch (e) {
            // console.log('no default config');
        }
        // extend default plugin cfg with our custom config
        Object.assign(plugin_cfg, config.plugins[pid]);

        // the plugin wants to define api routes
        const plugin_router = getRouter();

        plugin.api({
            router: plugin_router,
            models, logger,
            config: {
                global: config,
                plugin: plugin_cfg
            }
        });

        logger.info(`hooked in plugin ${plugin_name} (on ${version || 'master'})`);

        if (plugin_cfg.open_access) {
            router.use(`/${plugin_name}`, plugin_router);
        } else {
            router.use(`/${plugin_name}`,
                requirePlugin(plugin_name),
                plugin_router);
        }
    }
}

module.exports = router;

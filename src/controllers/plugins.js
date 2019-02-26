const express = require('express');
const router = express.Router();

const getRouter = require('../lib/getRouter');
const config = require('../config');
const hooks = require('../hooks');
const logger = require('../lib/logger');
const models = require('@datawrapper/orm/models');

const requirePlugin = require('../lib/requirePlugin');

// load plugins
for (let pid of Object.keys(config.plugins)) {
    const pluginName = pid.split('@')[0];
    // load the plugin
    let plugin;
    try {
        plugin = require(`@datawrapper/plugin-${pluginName}`);
    } catch (e) {
        logger.error(`could not load the plugin ${pluginName}. Try npm install...`);
    }

    if (plugin && plugin.api) {
        let pluginConfig = {};
        try {
            // load plugin default config
            pluginConfig = require(`@datawrapper/plugin-${pluginName}/config`);
        } catch (e) {
            // console.log('no default config');
        }
        // extend default plugin cfg with our custom config
        Object.assign(pluginConfig, config.plugins[pid]);

        // the plugin wants to define api routes
        const pluginRouter = getRouter();

        plugin.api({
            router: pluginRouter,
            models,
            logger,
            hooks,
            config: {
                global: config,
                plugin: pluginConfig
            }
        });

        const { version } = require(`@datawrapper/plugin-${pluginName}/package.json`);

        logger.info(`hooked in plugin ${pluginName} (on v${version || 'latest'})`);

        if (pluginConfig.open_access) {
            router.use(`/${pluginName}`, pluginRouter);
        } else {
            router.use(`/${pluginName}`, requirePlugin(pluginName), pluginRouter);
        }
    }
}

module.exports = router;

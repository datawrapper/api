const express = require('express');
const router = express.Router();

const getRouter = require('../lib/getRouter');
const config = require('../../config');
const models = require('datawrapper-orm/models');

const requirePlugin = require('../lib/requirePlugin');
const lib = require('../lib');

// load plugins
for (let pid of config.plugins) {
    const [plugin_name, version] = pid.split('#');
    // load the plugin
    const plugin = require(`datawrapper-plugin-${plugin_name}`);

    if (plugin && plugin.api) {
        // the plugin wants to define api routes
        const plugin_router = getRouter();

        plugin.api({ router: plugin_router, models, config });

        router.use(`/${plugin_name}`,
            requirePlugin(plugin_name),
            plugin_router);
    }
}

module.exports = router;

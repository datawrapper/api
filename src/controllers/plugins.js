const getRouter = require('../lib/getRouter');
const config = require('../../config');
const router = getRouter();

// load plugins
for (let plugin_name of config.plugins) {
    // load the plugin
    const plugin = require(`datawrapper-plugin-${plugin_name}`);

    if (plugin && plugin.api) {
        // the plugin wants to define api routes
        const plugin_router = getRouter();
        router.use(`/${plugin_name}`, plugin_router);
        plugin.api({router: plugin_router});
    }

}

module.exports = router;

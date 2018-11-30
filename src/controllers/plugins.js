const getRouter = require('../lib/getRouter');
const config = require('../../config');
const router = getRouter();
const models = require('datawrapper-orm/models');

const lib = require('../lib');

// load plugins
for (let pid of config.plugins) {
    const [plugin_name, version] = pid.split('#');
    // load the plugin
    const plugin = require(`datawrapper-plugin-${plugin_name}`);

    if (plugin && plugin.api) {
        // the plugin wants to define api routes
        const plugin_router = getRouter();
        router.use(`/${plugin_name}`, plugin_router);
        plugin.api({router: plugin_router, models, lib});
    }

}

module.exports = router;

/* globals process */
const logger = require('./lib/logger');
const ORM = require('@datawrapper/orm');
const config = require('./config');
const { version } = require('../package.json');

logger.info(`starting @datawrapper/api v${version}`);

// initialize database
ORM.init(config).then(() => {
    // register api plugins with core db
    const Plugin = require('@datawrapper/orm/models/Plugin');
    Plugin.register('datawrapper-api', Object.keys(config.plugins));

    // REST API
    const app = require('./app');
    const port = config.api && config.api.port ? config.api.port : process.env.PORT || 3000;

    app.listen(port, () => {
        logger.info('API server listening on port ' + port);
    });
});

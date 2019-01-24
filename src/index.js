/* globals process */
const logger = require('./lib/logger');
const ORM = require('@datawrapper/orm');
const config = require('./config');

// initialize database
ORM.init(config);

// register api plugins with core db
const Plugin = require('@datawrapper/orm/models/Plugin');
Plugin.register('datawrapper-api', Object.keys(config.plugins));

// REST API
const rest_app = require('./app');
const port = (config.api && config.api.port ? config.api.port :
    process.env.PORT || 3000);

rest_app.listen(port, () => {
    logger.info('API server listening on port ' + port);
});

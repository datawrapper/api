// initialize database
const ORM = require('datawrapper-orm');
const config = require('./config');
ORM.init(config);

// register api plugins with core db
const Plugin = require('datawrapper-orm/models/Plugin');
Plugin.register('datawrapper-api', config.plugins);

// REST API
const rest_app = require('./src/app');
const port = process.env.PORT || 3000;
const rest_server = rest_app.listen(port, () => {
  	console.log('Express server listening on port ' + port);
});


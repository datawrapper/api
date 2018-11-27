// initialize database
const ORM = require('datawrapper-orm');
const config = require('./config');
ORM.init(config.db);

// REST API
const rest_app = require('./src/app');
const port = process.env.PORT || 3000;
const rest_server = rest_app.listen(port, () => {
  console.log('Express server listening on port ' + port);
});


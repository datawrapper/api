// initialize database
const ORM = require('datawrapper-orm');
const config = require('./config');
ORM.init(config.db);

// REST API
const rest_app = require('./src/rest/app');
const port = process.env.PORT || 3000;
const rest_server = rest_app.listen(port, () => {
  console.log('Express server listening on port ' + port);
});

// TLS SOCKET server
const socket_app = require('./src/socket/server');
socket_app.listen(config.socket.port, config.socket.host, () => {
  	console.log("Socket server listening at %s, on port %s", config.socket.host, config.socket.port);
});

// Websockets?


// Crons for maintainance
require('./src/cron');
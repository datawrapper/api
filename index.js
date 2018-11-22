// REST API server
const ORM = require('datawrapper-orm');
const config = require('./config');
ORM.init(config.db);

const app = require('./src/app');
const port = process.env.PORT || 3000;

const api_server = app.listen(port, () => {
  console.log('Express server listening on port ' + port);
});

const socket = require('./src/socket');

// TLS SOCKET server
socket.listen(config.socket.port, config.socket.host, () => {
  	console.log("Socket listening at %s, on port %s", config.socket.host, config.socket.port);
});


// Websockets?

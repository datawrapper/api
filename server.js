// REST API server
const app = require('./src/app');
const port = process.env.PORT || 3000;

const server = app.listen(port, () => {
  console.log('Express server listening on port ' + port);
});

// TLS SOCKET server


// Websockets?

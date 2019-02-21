const express = require('express');
const app = express();

app.use('/3', (req, res) => {
	res.redirect(303, '/v3' + req.path);
});

app.use(`/v3`, require('./v3'));

// custom error handler
app.use(function(err, req, res, next) {
	if (res.headersSent) return next(err);
	res.status(500).send({ error: err instanceof Error ? err.message : err });
});

app.get('/', (req, res) => {
	res.status(200).send('api is running');
});

// add other, non-v3 stuff here

module.exports = app;

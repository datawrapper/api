const express = require('express');
const app = express();

// const auth = authentication().for(bearer(verify));
// const authentication = require('express-authentication'),
// const bearer = require('express-authentication-bearer'),


// function verify(data, callback) {
// 	// check that auth token exists

// 	redis.get(key(data), function done(err, result) {
// 		if (err) {
// 			return callback(err);
// 		} else {
// 			var authed = !!data,
// 				output = result ? JSON.parse(result) : { error: 'NO_TOKEN' };
// 			callback(null, authed, output);
// 		}
// 	});
// }


app.get('/', (req, res) => {
    res.status(200)
        .send('hello world!');
});

app.use(`/v3`, require('./v3'));


// custom error handler
app.use(function(err, req, res, next) {
    if (res.headersSent) return next(err)
    res.status(500).send({ error: err instanceof Error ? err.message : err });
})

// add other, non-v3 stuff here

module.exports = app;


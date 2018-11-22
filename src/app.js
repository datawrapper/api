const express = require('express');
const app = express();

app.get('/', (req, res) => {
    res.status(200)
        .send('hello world!');
});

app.use(`/v3`, require('./v3'));

// add other, non-v3 stuff here

module.exports = app;


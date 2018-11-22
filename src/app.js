const express = require('express');
const app = express();
const api_v3 = require('./v3');

app.use(`/v3`, api_v3);

module.exports = app;


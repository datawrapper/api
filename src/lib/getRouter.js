
const express = require('express');
const bodyParser = require('body-parser');

module.exports = function() {
	const router = express.Router();
	router.use(bodyParser.urlencoded({ extended: true }));
	router.use(bodyParser.json());

	return router;
}


const express = require('express');
const router = express.Router();
const controllers = require('./controllers');

for (let key of Object.keys(controllers)) {
    router.use(`/${key}`, controllers[key]);
}

module.exports = router;

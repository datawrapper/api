const express = require('express');
const router = express.Router();

router.use('/charts', require('./controllers/charts'));

// TODO
// router.use('/folders', require('./controllers/folders'));
// router.use('/products', require('./controllers/products'));
// router.use('/teams', require('./controllers/teams'));
// router.use('/themes', require('./controllers/themes'));
// router.use('/users', require('./controllers/users'));
// router.use('/jobs', require('./controllers/jobs'));


module.exports = router;

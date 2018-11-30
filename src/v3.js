const express = require('express');
const router = express.Router();

// v3 supports authentication via Bearer
router.use(require('./lib/authBearer'));

router.use('/account', require('./controllers/account'));
router.use('/charts', require('./controllers/charts'));
router.use('/jobs', require('./controllers/jobs'));

// plugin hooks
router.use('/plugins', require('./controllers/plugins'));

// TODO
// router.use('/folders', require('./controllers/folders'));
// router.use('/products', require('./controllers/products'));
// router.use('/teams', require('./controllers/teams'));
// router.use('/themes', require('./controllers/themes'));
// router.use('/users', require('./controllers/users'));



module.exports = router;

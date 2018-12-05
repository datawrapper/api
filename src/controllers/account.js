const router = require('../lib/getRouter')();
const requireUser = require('../lib/requireUser');

// show details of authenticated user
router.get('/', requireUser, (req, res) => {
    res.status(200).send({user: res.locals.user.serialize() })
});

module.exports = router;

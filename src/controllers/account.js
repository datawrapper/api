const router = require('../lib/getRouter')();
const requireUser = require('../lib/requireUser');

// show details of authenticated user
router.get('/', (req, res) => {
    if (res.locals.user) {
        res.status(200).send(res.locals.user.serialize());
    } else if (res.locals.session) {
        res.status(200).send({
            id: null,
            created_at: res.locals.session.date_created,
            role: 'guest'
        });
    } else {
        requireUser(req, res);
    }
});


module.exports = router;

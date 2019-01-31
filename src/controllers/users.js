const router = require('../lib/getRouter')();
const logger = require('../lib/logger');

const requireAdmin = require('../lib/requireAdmin');
const { User, Team } = require('@datawrapper/orm/models');

// create a new user
router.post('/', (req, res) => {});

// returns list of users
router.get('/', requireAdmin, async (req, res) => {
    logger.info('list users', req.query);
    let where = { deleted: 0 };
    // todo check privileges
    const expand = req.query.expand ? req.query.expand.split(',') : [];

    try {
        const opts = {
            where: where,
            order: [['created_at', 'DESC']],
            limit: 20
        };
        if (expand.includes('team')) {
            opts.include = [
                {
                    model: Team
                }
            ];
        }
        const users = await User.findAll(opts);
        res.status(200).send(users.map(u => u.serialize()));
    } catch (err) {
        console.warn(err);
        res.status(500).send('There was a problem finding the charts.');
    }
});

// return a single user
// router.get('/:id', , (req, res) => {
//     res.status(200).send(res.locals.chart.toJSON());
// });

module.exports = router;

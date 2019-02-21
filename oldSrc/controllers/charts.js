const router = require('../lib/getRouter')();

const requireUser = require('../lib/requireUser');
const checkChartWriteAccess = require('../lib/checkChartWriteAccess');
const { Chart } = require('@datawrapper/orm/models');

// create a new chart
router.post('/', (req, res) => {
    // auto-generate ID
    Chart.create(
        {
            // name : req.body.name,
            // email : req.body.email,
            // password : req.body.password
        },
        (err, chart) => {
            if (err) {
                return res
                    .status(500)
                    .send('There was a problem adding the information to the database.');
            }
            res.status(200).send(chart);
        }
    );
});

// returns all public charts in the database
router.get('/', (req, res) => {
    let where = { deleted: 0 };
    if (res.locals.user) {
        // user is signed in, return the users charts
        where.author_id = res.locals.user.id;
    } else if (res.locals.session) {
        // guest session. return the guests chart
        where.guest_session = res.locals.session.id;
    } else {
        return requireUser(req, res);
    }

    Chart.findAll({
        where: where,
        order: [['last_modified_at', 'DESC']],
        limit: 100
    })
        .then(charts => {
            res.status(200).send(charts);
        })
        .catch(err => {
            console.warn(err);
            res.status(500).send('There was a problem finding the charts.');
        });
});

// return a single chart
router.get('/:id', checkChartWriteAccess, (req, res) => {
    res.status(200).send(res.locals.chart.toJSON());
});

// update a chart
router.put('/:id', checkChartWriteAccess, (req, res) => {
    const { chart } = res.locals;

    const data = req.body;
    let changed = false;

    ['title', 'type', 'theme', 'last_edit_step', 'language', 'metadata'].forEach(key => {
        // todo: compare metadata json structure
        if (data[key] && data[key] !== chart[key]) {
            changed = true;
            chart[key] = data[key];
        }
    });

    if (changed) {
        chart.last_modified_at = new Date();

        chart.save().then(() => {
            res.status(200).send({ status: 'ok' });
        });
    } else {
        res.send({ status: 'ok', message: 'no changes' });
    }
});

// update new chart data
router.put('/:id/data', checkChartWriteAccess, () => {
    // Chart.findByPk(req.params.id).then(chart => {
    //     res.status(200).send(chart);
    // }).catch(err => {
    //     console.warn(err);
    //     res.status(500).send("There was a problem finding the charts.");
    // });
});

module.exports = router;

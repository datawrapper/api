const router = require('../lib/getRouter')();

const {Chart} = require('datawrapper-orm/models');

// create a new chart
router.post('/', (req, res) => {

    // auto-generate ID
    Chart.create({
        // name : req.body.name,
        // email : req.body.email,
        // password : req.body.password
    }, (err, chart) => {
        if (err) return res.status(500).send("There was a problem adding the information to the database.");
        res.status(200).send(chart);
    });

});

// returns all the charts in the database
router.get('/', (req, res) => {

    Chart.findAll({
        where: { deleted: 0 },
        order: [['last_modified_at', 'DESC']],
        limit: 100
    }).then(charts => {
        res.status(200).send(charts);
    }).catch(err => {
        console.warn(err);
        res.status(500).send("There was a problem finding the charts.");
    });

});

// return a single chart
router.get('/:id', (req, res) => {

    Chart.findByPk(req.params.id).then(chart => {
        res.status(200).send(chart);
    }).catch(err => {
        console.warn(err);
        res.status(500).send("There was a problem finding the charts.");
    });

});

// update a chart
router.put('/:id', (req, res) => {

    // Chart.findByPk(req.params.id).then(chart => {
    //     res.status(200).send(chart);
    // }).catch(err => {
    //     console.warn(err);
    //     res.status(500).send("There was a problem finding the charts.");
    // });

});

// update new chart data
router.put('/:id/data', (req, res) => {

    // Chart.findByPk(req.params.id).then(chart => {
    //     res.status(200).send(chart);
    // }).catch(err => {
    //     console.warn(err);
    //     res.status(500).send("There was a problem finding the charts.");
    // });

});

module.exports = router;

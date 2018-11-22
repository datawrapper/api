const express = require('express');
const router = express.Router();
const bodyParser = require('body-parser');

router.use(bodyParser.urlencoded({ extended: true }));
router.use(bodyParser.json());

const {ExportJob} = require('datawrapper-orm/models');

// returns all the charts in the database

const jobList = (where) => {
    return (req, res) => {
        // priority filter using ?priority=2
        if (req.query.priority !== undefined) {
            where.priority = req.query.priority;
        }
        ExportJob.findAll({
            where,
            order: [['created_at', 'DESC']],
            limit: 100
        }).then(jobs => {
            res.status(200).send(jobs);
        }).catch(err => {
            console.warn(err);
            res.status(500).send("There was a problem finding the jobs.");
        });
    };
};

// list all jobs
router.get('/', jobList({}));

// separate lists for each status /queued /done /failed etc
for (let s of ['queued', 'in_progress', 'done', 'failed']) {
    router.get('/'+s, jobList({status: s}));
}

// return a single job
router.get('/:id', (req, res) => {

    ExportJob.findByPk(req.params.id).then(job => {
        res.status(200).send(job);
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

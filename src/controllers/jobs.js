const router = require('../lib/getRouter')();

const {ExportJob} = require('datawrapper-orm/models');

// returns all the charts in the database

const jobList = (where) => {
    return async (req, res) => {
        // priority filter using ?priority=2
        if (req.query.priority !== undefined) {
            where.priority = req.query.priority;
        }
        try {
            const jobs = await ExportJob.findAll({
                where,
                order: [['created_at', 'DESC']],
                limit: 100
            });
            res.status(200).send(jobs);
        } catch (err) {
            res.status(500).send("There was a problem finding the jobs.");
        }
    };
};

// list all jobs
// https://api.datawrapper.de/3/jobs/
router.get('/', jobList({}));

// separate lists for each status /queued /done /failed etc
// https://api.datawrapper.de/3/jobs/queued
// https://api.datawrapper.de/3/jobs/in_progres
// https://api.datawrapper.de/3/jobs/failed
// https://api.datawrapper.de/3/jobs/done
for (let s of ['queued', 'in_progress', 'done', 'failed']) {
    router.get('/'+s, jobList({status: s}));
}

// return a single job, e.g.
// https://api.datawrapper.de/3/jobs/22821
router.get('/:id', async (req, res) => {
    const job = ExportJob.findByPk(req.params.id);
    res.status(200).send(job);
});

router.get('/:id', async (req, res) => {
    const job = ExportJob.findByPk(req.params.id);
    res.status(200).send(job);
});


module.exports = router;

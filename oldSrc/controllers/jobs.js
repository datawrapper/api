const router = require('../lib/getRouter')();
const requireAdmin = require('../lib/requireAdmin');

const { ExportJob } = require('@datawrapper/orm/models');

// returns all the charts in the database

const jobList = where => {
    return async (req, res) => {
        // priority filter using ?priority=2
        if (req.query.priority !== undefined) where.priority = req.query.priority;
        if (req.query.chart_id !== undefined) where.chart_id = req.query.chart_id;
        if (req.query.key !== undefined) where.key = req.query.key;
        try {
            const jobs = await ExportJob.findAll({
                where,
                order: [['created_at', 'DESC']],
                limit: 100
            });
            res.status(200).send(jobs);
        } catch (err) {
            res.status(500).send('There was a problem finding the jobs.');
        }
    };
};

// list all jobs
// https://api.datawrapper.de/3/jobs/
router.get('/', requireAdmin, jobList({}));

// separate lists for each status /queued /done /failed etc
// https://api.datawrapper.de/3/jobs/status/queued
// https://api.datawrapper.de/3/jobs/in_progres
// https://api.datawrapper.de/3/jobs/failed
// https://api.datawrapper.de/3/jobs/done
for (let s of ['queued', 'in_progress', 'done', 'failed']) {
    router.get('/' + s, requireAdmin, jobList({ status: s }));
}

// return a single job, e.g.
// https://api.datawrapper.de/3/jobs/22821
router.get('/:id', requireAdmin, async (req, res) => {
    const job = await ExportJob.findByPk(req.params.id);
    res.status(200).send(job);
});

module.exports = router;

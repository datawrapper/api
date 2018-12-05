const {Op} = require('sequelize');
const {groupBy, values} = require('underscore');
const {Stats} = require('@datawrapper/orm/models');
const {csvFormat} = require('d3-dsv');

const router = require('../lib/getRouter')();
const requireAdmin = require('../lib/requireAdmin');
/*
 * https://api.datawrapper.de/3/stats/daily/
 */
router.get('/:prefix/:metrics?.(json|csv)', requireAdmin, async (req,res) => {
    let metrics;

    if (req.params.metrics) {
        metrics = req.params.metrics.split(',').map(d => `${req.params.prefix}:${d}`);
    } else {
        metrics = req.params.prefix.split(',');
    }
    const long = await Stats.findAll({
        where: { metric: {[Op.in]: metrics} },
        limit: 10000,
        order: [
            ['time', 'DESC'],
        ]
    });
    const result = values(groupBy(long, 'time')).map(rows => {
        const row = {
            time: rows[0].time.toISOString()
        };
        rows.forEach(r => {
            const k = req.params.metrics ? r.metric.substr(req.params.prefix.length+1) : r.metric;
            row[k] = r.value;
        });
        metrics.forEach(m => {
            const k = req.params.metrics ? m.substr(req.params.prefix.length+1) : m;
            if (row[k] === undefined) row[k] = 0;
        });
        return row;
    });

    if (req.params[0] == 'csv') {
        res.header('Content-Type', 'text/csv').send(csvFormat(result));
    } else {
        res.send(result);
    }
});

module.exports = router;

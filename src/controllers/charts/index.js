const router = require('../../lib/getRouter')();

const checkChartWriteAccess = require('../../lib/checkChartWriteAccess');
const chartExportFormats = require('../../hooks/chartExportFormats');

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
router.get('/', require('./getCharts'));

// return a single chart
router.get('/:id', checkChartWriteAccess, (req, res) => {
    res.status(200).send(res.locals.chart.toJSON());
});

// update a chart
router.put('/:id', checkChartWriteAccess, require('./updateChart'));

// update new chart data
router.put('/:id/data', checkChartWriteAccess, () => {
    // Chart.findByPk(req.params.id).then(chart => {
    //     res.status(200).send(chart);
    // }).catch(err => {
    //     console.warn(err);
    //     res.status(500).send("There was a problem finding the charts.");
    // });
});

// update new chart data
router.post('/:id/export/:format', checkChartWriteAccess, async (req, res) => {
    const { format } = req.params; // eslint-disable-line
    if (chartExportFormats.has(format)) {
        return chartExportFormats.get(format)(req, res);
    }
    res.status(400).send(`export format ${format} is not supported.`);
});

module.exports = router;

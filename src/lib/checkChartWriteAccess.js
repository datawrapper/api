const { Chart } = require('@datawrapper/orm/models');

module.exports = async function (req, res, next) {
    try {
        const chart = await Chart.findByPk(req.params.id);
        if (!chart) return next('chart not found');
        res.locals.chart = chart;
        const allow = await chart.isEditableBy(res.locals.user, res.locals.session);
        if (allow) {
            next();
        } else {
            next('access denied');
        }
    } catch (e) {
        next(e);
    }
};

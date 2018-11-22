const {Op} = require('sequelize');
const {db} = require('datawrapper-orm');
const {Chart, ExportJob} = require('datawrapper-orm/models');

module.exports = (async () => {
    // prepare statement to compute seconds since last edit
    const edited_ago = db.fn('TIMESTAMPDIFF',
        db.literal('SECOND'),
        db.col('last_modified_at'),
        db.fn('NOW'));

    // retreive chart
    const editedCharts = await Chart.findAll({
        attributes: ['id', 'author_id', 'organization_id'],
        limit: 100,
        order: [['last_modified_at', 'DESC']],
        where: {
            [Op.and]: [
                // chart not deleted AND
                {deleted: false},
                // chart edited within last 90 seconds
                db.where(edited_ago, Op.lt, 300000),
            ]
        }
    });

    console.log(editedCharts.map(c => c.toJSON()));
});
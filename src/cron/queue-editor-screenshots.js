const {Op} = require('sequelize');
const {db} = require('datawrapper-orm');
const {Chart, ExportJob} = require('datawrapper-orm/models');
const config = require('../../config');

module.exports = (async () => {
    console.log('look for edited charts');
    // prepare statement to compute seconds since last edit
    const edited_ago = db.fn('TIMESTAMPDIFF',
        db.literal('SECOND'),
        db.col('last_modified_at'),
        db.fn('NOW'));

    // retreive charts
    const editedCharts = await Chart.findAll({
        attributes: [
            'id', 'author_id', 'organization_id',
            [db.fn('MD5',
                db.fn('CONCAT',
                    db.col('id'),
                    '--',
                    db.fn('UNIX_TIMESTAMP', db.col('created_at')))
            ), 'hash']
        ],
        limit: 100,
        order: [['last_modified_at', 'DESC']],
        where: {
            [Op.and]: [
                // chart not deleted AND
                {deleted: false},
                // chart edited within last N seconds
                db.where(edited_ago, Op.lt, 70),
            ]
        }
    });

    // create export jobs for the charts
    const newJobs = editedCharts.map(chart => {
        const img_path = `/${chart.id}/${chart.hash}/plain.png`;

        const tasks = [{ // first take a screenshot
            action: 'png',
            params: {
                url: `http${config.core.https?'s':''}://${config.core.domain}/chart/${chart.id}/preview?plain=1`,
                sizes: [{
                    zoom: 2,
                    width: 480,
                    height: 'auto',
                    out: 'screenshot.png'
                }]
            }
        }];
        // now check for other things we need to do
        const png = config.export.png;
        if (png.target == 's3') {
            // upload to S3
            tasks.push({
                action: 's3',
                params: {
                    file: 'screenshot.png',
                    bucket: 'img.datawrapper.de',
                    path: img_path
                }
            });
            const cf = png.cloudflare;
            if (cf) {
                // also invalidate cloudflare cache
                tasks.push({
                    action: 'cloudflare',
                    params: { urls: [`https://${cf.domain}${img_path}`] }
                })
            }
        } else if (png.target == 'file') {
            // just copy the image to some local folder
            tasks.push({
                action: 'file',
                params: {
                    file: 'screenshot.png',
                    out: png.path + img_path
                }
            });
        }


        return {
            key: 'edit/screenshot',
            chart_id: chart.id,
            user_id: chart.author_id,
            created_at: new Date(),
            status: 'queued',
            priority: 0,
            tasks
        };
    });

    console.log('new jobs', newJobs);

    await ExportJob.bulkCreate(newJobs);
});
const SQ = require('sequelize');

module.exports = (db) => {

    const ExportJob = db.define('export_job', {
        id: {type:SQ.INTEGER, primaryKey:true, autoIncrement: true},
        priority: SQ.INTEGER,
        user_id: SQ.INTEGER,
        chart_id: SQ.STRING(5),
        status: SQ.ENUM('queued', 'in_progress', 'done', 'failed'),

        created_at: SQ.DATE,
        processed_at: SQ.DATE,
        done_at: SQ.DATE,

        last_task: SQ.INTEGER,
        data: SQ.JSON
    }, {
        timestamps: false,
        tableName: 'export_job'
    });

    ExportJob.sync({force:false});

    return ExportJob;
}

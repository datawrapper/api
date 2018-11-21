const SQ = require('sequelize');

module.exports = (db) => {

    const Chart = db.define('chart', {
        id: { type: SQ.STRING(5), primaryKey: true },
        type: SQ.STRING,
        title: SQ.STRING,
        theme: SQ.STRING,

        author_id: SQ.INTEGER,
        guest_session: SQ.STRING,
        organization_id: SQ.STRING(128),
        folder_id: {type: SQ.INTEGER, field: 'in_folder'},

        created_at: SQ.DATE,
        last_modified_at: SQ.DATE,
        last_edit_step: SQ.INTEGER,

        published_at: SQ.DATE,
        public_url: SQ.STRING,
        public_version: SQ.INTEGER,

        deleted: SQ.BOOLEAN,
        deleted_at: SQ.DATE,

        forkable: SQ.BOOLEAN,
        is_fork: SQ.BOOLEAN,
        forked_from: SQ.STRING(5),

        metadata: SQ.JSON,
        language: SQ.STRING(5),
        external_data: SQ.STRING(),
    }, {
        timestamps: false,
        tableName: 'chart'
    });

    Chart.sync();

    return Chart;
}

require('dotenv').config({
    path: require('path').resolve('../../utils/docker/.datawrapper_env')
});

module.exports = {
    general: {
        localChartAssetRoot: '/tmp/data'
    },
    frontend: {
        domain: 'localhost',
        https: false
    },
    api: {
        domain: 'localhost',
        sessionID: 'DW-SESSION',
        enableMigration: true,
        hashRounds: 5,
        secretAuthSalt: 'MY_SECRET_AUTH_KEY',
        cors: ['*']
    },
    plugins: {
        'hello-world': {}
    },
    orm: {
        db: {
            dialect: 'mysql',
            host: 'localhost',
            port: process.env.DW_DATABASE_PORT,
            user: process.env.DW_DATABASE_USER,
            password: process.env.DW_DATABASE_PASS,
            database: process.env.DW_DATABASE_NAME
        }
    }
};

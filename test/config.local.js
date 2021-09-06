require('dotenv').config({
    path: require('path').resolve('../../utils/docker/.datawrapper_env')
});

module.exports = {
    general: {
        localPluginRoot: '/plugins',
        localChartAssetRoot: '/tmp/data',
        localChartPublishRoot: '/tmp/charts',
        imageDomain: process.env.DW_THUMBNAIL_URL
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
    plugins: {},
    orm: {
        db: {
            dialect: 'mysql',
            host: 'localhost',
            port: process.env.DW_DATABASE_HOST_PORT,
            user: process.env.DW_DATABASE_USER,
            password: process.env.DW_DATABASE_PASS,
            database: process.env.DW_DATABASE_NAME
        }
    }
};

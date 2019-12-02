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
        secretAuthSalt: process.env.SECRET_AUTH_SALT,
        cors: ['*']
    },
    plugins: {
        'hello-world': {}
    },
    orm: {
        db: {
            dialect: 'mysql',
            host: process.env.DB_HOST,
            port: process.env.DB_PORT,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            database: process.env.DB_NAME_API
        }
    }
};

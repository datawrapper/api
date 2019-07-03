module.exports = {
    general: {},
    frontend: {
        domain: 'localhost',
        https: false
    },
    api: {
        domain: 'localhost',
        sessionID: 'DW-SESSION',
        enableMigration: true,
        hashRounds: 15,
        authSalt: process.env.AUTH_SALT,
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

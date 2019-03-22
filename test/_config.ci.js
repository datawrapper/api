module.exports = {
    api: {
        domain: 'localhost',
        sessionID: 'DW-SESSION'
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
            database: process.env.DB_NAME
        }
    }
};

module.exports = {
    frontend: {
        domain: '<domain>.<tld>',
        https: false
    },
    api: {
        port: 3000,
        domain: '<domain>.<tld>',
        subdomain: '<subdomain>',
        sessionID: 'DW-SESSION',
        https: false,
        enableMigration: false,
        cors: ['*'],
        localPluginRoot: './datawrapper/plugins',
        /**
         * Amount of iterations the hashing algorithm uses. Value should be based on the hardware
         * the API server is running on.
         *
         * Recommendation: A request to /auth/login should take approximately 2s to complete.
         */
        hashRounds: 15,
        /**
         * This key is deprecated and only used for legacy hash comparison.
         * https://github.com/datawrapper/datawrapper/blob/master/config.template.yaml#L20.
         *
         * @deprecated
         */
        authSalt: '<MY_AUTH_SALT>',
        /**
         * This key is deprecated and only used for legacy hash comparison.
         * https://github.com/datawrapper/datawrapper/blob/master/config.template.yaml#L21.
         *
         * @deprecated
         */
        secretAuthSalt: '<MY_SECRET_AUTH_KEY>'
    },
    orm: {
        db: {
            dialect: 'mysql',
            host: '<host>',
            port: 3306,
            user: '<user>',
            password: '<password>',
            database: '<database>'
        }
    }
};

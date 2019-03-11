module.exports = {
    api: {
        port: 3000,
        domain: '<domain>',
        https: false,
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
    db: {
        dialect: 'mysql',
        host: '<host>',
        port: 3306,
        user: '<user>',
        password: '<password>',
        database: '<database>'
    }
};

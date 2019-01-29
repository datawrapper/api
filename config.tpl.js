const fs = require('fs');

module.exports = {

    frontend: {
        https: false,
        domain: 'app.datawrapper.local',
        img_domain: 'img.datawrapper.local'
    },

    api: {
        port: 18080, // internal port
        domain: 'api.datawrapper.local',
        cors: /\.datawrapper\.de$/.test,
        https: false
    },

    plugins: {
        // 'hello-world': {
        //     name: 'foo'
        // }
    },

    db: {
        dialect: 'mysql',
        host: '127.0.0.1',
        port: 3306,
        user: '',
        password: '',
        database: ''
    },

    socket () {
        return {
            host: 'api.datawrapper.de',
            port: 9838,
            tls: {
                requestCert: true,
                cert: fs.readFileSync('server-cert.pem'),
                key: fs.readFileSync('server-key.pem'),
                ca: [fs.readFileSync('client-cert.pem')]
            }
        };
    }

};

module.exports = {
    name: 'routes/auth',
    version: '1.0.0',
    register: (server, options) => {
        require('./activate')(server, options);
        require('./change-password')(server, options);
        require('./login')(server, options);
        require('./logout')(server, options);
        require('./resend-activation')(server, options);
        require('./reset-password')(server, options);
        require('./session')(server, options);
        require('./signup')(server, options);
        require('./tokens')(server, options);
    }
};

const Boom = require('boom');
const Joi = require('joi');
const internals = {};

internals.defaults = {
    cookie: 'DW-SESSION'
};

internals.schema = Joi.object().keys({
    cookie: Joi.string(),
    validate: Joi.func().required()
});

internals.implementation = (server, options) => {
    const opts = { ...internals.defaults, ...options };
    Joi.assert(opts, internals.schema);

    const scheme = {
        authenticate: async (request, h) => {
            const session = request.state['DW-SESSION'];

            const {
                isValid,
                credentials,
                message = Boom.unauthorized(null, 'session')
            } = await opts.validate(request, session, h);

            if (isValid) {
                return h.authenticated({ credentials });
            }

            return message;
        }
    };

    return scheme;
};

const CookieAuth = {
    name: 'dw-cookie-auth',
    version: '1.0.0',
    register: (server, options) => server.auth.scheme('cookie-auth', internals.implementation)
};

module.exports = CookieAuth;

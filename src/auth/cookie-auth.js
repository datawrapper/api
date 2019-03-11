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

    server.state(opts.cookie, {
        ttl: 1000 * 3600 * 24 * 365, // 1000ms = 1s -> 3600s = 1h -> 24h = 1d -> 365d = 1y
        strictHeader: true
    });

    const scheme = {
        authenticate: async (request, h) => {
            const session = request.state[opts.cookie];

            const {
                isValid,
                credentials,
                artifacts,
                message = Boom.unauthorized(null, 'Session')
            } = await opts.validate(request, session, h);

            if (isValid) {
                h.state(opts.cookie, session);
                return h.authenticated({ credentials, artifacts });
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

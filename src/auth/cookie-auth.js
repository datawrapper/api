const Boom = require('@hapi/boom');
const Joi = require('@hapi/joi');
const { cookieTTL } = require('../utils');
const internals = {};

internals.schema = Joi.object().keys({
    cookie: Joi.string(),
    validate: Joi.func().required()
});

internals.implementation = (server, options) => {
    const api = server.methods.config('api');
    const opts = { cookie: api.sessionID, ...options };
    Joi.assert(opts, internals.schema);

    server.state(opts.cookie, {
        ttl: cookieTTL(90),
        isSecure: process.env.NODE_ENV === 'production',
        strictHeader: false,
        domain: api.domain,
        isSameSite: false,
        path: '/'
    });

    const scheme = {
        authenticate: async (request, h) => {
            let session = request.state[opts.cookie];

            /**
             * Sometimes there are 2 session cookies, in the staging environment, with name
             * DW-SESSION. The reason is that the same name is used on live (.datawrapper.de) and
             * staging (.staging.datawrapper.de). The cookie parser therefore returns an array with
             * both cookies and since the server doesn't send any information which cookie belongs
             * to which domain, the code relies on the server sending the more specific cookie
             * first. This is fine since it only happens on staging and the quick fix is to delete
             * the wrong cookie in dev tools.
             *
             * More information and a similar issue can be found on Github:
             * https://github.com/jshttp/cookie/issues/18#issuecomment-30344206
             */
            if (Array.isArray(session)) {
                session = session[0];
            }

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

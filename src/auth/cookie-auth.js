const Boom = require('@hapi/boom');
const { getStateOpts } = require('./utils');
const { Session } = require('@datawrapper/orm/models');
const getUser = require('./get-user');

async function cookieValidation(request, session, h) {
    let row = await Session.findByPk(session);

    if (!row) {
        return { isValid: false, message: Boom.unauthorized('Session not found', 'Session') };
    }

    row = await row.update({
        data: {
            ...row.data,
            last_action_time: Math.floor(Date.now() / 1000)
        }
    });

    return getUser(row.data['dw-user-id'], {
        credentials: { session, data: row, scope: ['all'] },
        strategy: 'Session',
        logger: request.server.logger()
    });
}

function cookieAuth(server, options) {
    const api = server.methods.config('api');
    const opts = { cookie: api.sessionID, ...options };

    server.state(opts.cookie, getStateOpts(api.domain, 90));

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
            } = await cookieValidation(request, session, h);

            if (isValid) {
                h.state(opts.cookie, session);
                return h.authenticated({ credentials, artifacts });
            }

            return message;
        }
    };

    return scheme;
}

const CookieAuth = {
    name: 'dw-cookie-auth',
    version: '1.0.0',
    register: (server, options) => server.auth.scheme('cookie-auth', cookieAuth)
};

module.exports = CookieAuth;

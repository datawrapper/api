const bcrypt = require('bcrypt');
const crypto = require('crypto');
const nanoid = require('nanoid');
const Joi = require('joi');
const Boom = require('boom');
const { User, Session } = require('@datawrapper/orm/models');
const { cookieTTL } = require('../utils');

const config = require('../../config');

const DEFAULT_SALT = 'uRPAqgUJqNuBdW62bmq3CLszRFkvq4RW';

/**
 * The old PHP API used sha256 to hash passwords with constant salts.
 * The Node.js API uses bcrypt which is more secure.
 * It is still important to support the old way for migration purposes since PHP and Node API
 * will live side by side for some time.
 * When the PHP Server gets turned off, we can hopefully delete this function.
 *
 * @deprecated
 * @param {string} password - Password string sent from the client (Can be client side hashed or not)
 * @param {string} passwordHash - Password hash to compare (from DB)
 * @returns {boolean}
 */
function oldSchoolLogin(password, passwordHash) {
    function oldschoolHash(pwhash, secret) {
        const hmac = crypto.createHmac('sha256', secret);
        hmac.update(pwhash);
        return hmac.digest('hex');
    }

    let serverHash = oldschoolHash(password, config.api.secretAuthSalt);

    if (serverHash === passwordHash) return true;

    const clientHash = oldschoolHash(password, config.api.authSalt || DEFAULT_SALT);
    serverHash = oldschoolHash(clientHash, config.api.secretAuthSalt || '');

    return serverHash === passwordHash;
}

module.exports = {
    name: 'auth-routes',
    version: '1.0.0',
    register: (server, options) => {
        server.route({
            method: 'POST',
            path: '/login',
            config: {
                tags: ['api'],
                auth: false,
                validate: {
                    payload: {
                        email: Joi.string()
                            .email()
                            .required(),
                        password: Joi.string().required(),
                        keepSession: Joi.boolean().default(true)
                    }
                }
            },
            handler: login
        });

        server.route({
            method: 'POST',
            path: '/logout',
            config: {
                tags: ['api'],
                auth: 'session'
            },
            handler: logout
        });
    }
};

async function login(request, h) {
    const { email, password, keepSession } = request.payload;
    const user = await User.findOne({
        where: { email },
        attributes: ['id', 'pwd']
    });

    if (!user) {
        return Boom.unauthorized('Invalid credentials');
    }

    let isValid = false;

    /**
     * Bcrypt uses a prefix for versioning. That way a bcrypt hash can be identified with "$2".
     * https://en.wikipedia.org/wiki/Bcrypt#Description
     */
    if (user.pwd.startsWith('$2')) {
        isValid = await bcrypt.compare(password, user.pwd);
    } else {
        isValid = oldSchoolLogin(password, user.pwd);
    }

    if (!isValid) {
        return Boom.unauthorized('Invalid credentials');
    }

    const session = await Session.create({
        id: nanoid(),
        data: {
            'dw-user-id': user.id,
            persistent: keepSession,
            last_action_time: Math.floor(Date.now() / 1000)
        }
    });

    return h
        .response({
            [config.api.sessionID]: session.id
        })
        .state(config.api.sessionID, session.id, {
            ttl: cookieTTL(keepSession ? 90 : 30)
        });
}

async function logout(request, h) {
    const session = await Session.findByPk(request.state[config.api.sessionID], {
        attributes: ['id']
    });
    await session.destroy();
    return h
        .response()
        .code(205)
        .unstate(config.api.sessionID)
        .header('Clear-Site-Data', '"cookies", "storage", "executionContexts"');
}

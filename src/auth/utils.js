const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { cookieTTL } = require('../utils');
const { User, Session, Chart } = require('@datawrapper/orm/models');

const DEFAULT_SALT = 'uRPAqgUJqNuBdW62bmq3CLszRFkvq4RW';

/**
 * Generate a sha256 hash from a string. This is used in the PHP API and is needed for backwards
 * compatibility.
 *
 * @param {string} pwhash - value to hash with sha256
 * @param {string} secret - salt to hash the value with
 * @returns {string}
 */
function legacyHash(pwhash, secret = DEFAULT_SALT) {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(pwhash);
    return hmac.digest('hex');
}

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
 * @param {string} authSalt - defined in config.js
 * @param {string} secretAuthSalt - defined in config.js
 * @returns {boolean}
 */
function legacyLogin(password, passwordHash, authSalt, secretAuthSalt) {
    let serverHash = secretAuthSalt ? legacyHash(password, secretAuthSalt) : password;

    if (serverHash === passwordHash) return true;

    const clientHash = legacyHash(password, authSalt);
    serverHash = secretAuthSalt ? legacyHash(clientHash, secretAuthSalt) : clientHash;
    return serverHash === passwordHash;
}

/**
 * Migrate the old sha256 password hash to a more modern and secure bcrypt hash.
 *
 * @param {number} userId - ID of the user to migrate
 * @param {string} password - User password
 * @param {number} hashRounds - Iteration amout for bcrypt
 */
async function migrateHashToBcrypt(userId, password, hashRounds) {
    const hash = await bcrypt.hash(password, hashRounds);

    await User.update(
        {
            pwd: hash
        },
        { where: { id: userId } }
    );
}

/**
 * Hash a password with bcrypt. This function doesn't need to be directly imported since it's
 * exposed on the Hapi server object as server method.
 *
 * @example
 * const hash = await server.methods.hashPassword('hunter2')
 *
 * @param {number} hashRounds - Number of rounds for the brypt algorithm
 */
function createHashPassword(hashRounds) {
    return async function hashPassword(password) {
        return password === '' ? password : bcrypt.hash(password, hashRounds);
    };
}

function createComparePassword(server) {
    /**
     * Check validity of a password against the saved password hash
     *
     * @param {string} password - Plaintext password to check
     * @param {string} passwordHash - Password hash to compare (from DB)
     * @param {object} options
     * @param {number} options.userId - User ID for hash migration
     * @returns {Boolean}
     */
    return async function comparePassword(password, passwordHash, { userId }) {
        const { api } = server.methods.config();
        let isValid = false;
        /**
         * Bcrypt uses a prefix for versioning. That way a bcrypt hash can be identified with "$2".
         * https://en.wikipedia.org/wiki/Bcrypt#Description
         */
        if (passwordHash.startsWith('$2')) {
            isValid = await bcrypt.compare(password, passwordHash);
            /**
             * Due to the migration from sha256 to bcrypt, the API must deal with sha256 passwords that
             * got created by the PHP API and migrated from the `migrateHashToBcrypt` function.
             * The node API get's passwords only in clear text and to compare those with a migrated
             * password, it first has to generate the former client hashed password.
             */
            if (!isValid) {
                isValid = await bcrypt.compare(legacyHash(password, api.authSalt), passwordHash);
            }
        } else {
            /**
             * The user password hash was created by the PHP API and is not a bcrypt hash. That means
             * the API needs to use the old comparison method with double sha256 hashes.
             */
            isValid = legacyLogin(password, passwordHash, api.authSalt, api.secretAuthSalt);

            /**
             * When the old method works, the API migrates the old hash to a bcrypt hash for more
             * security. This ensures a seemless migration for users.
             */
            if (isValid && userId && api.enableMigration) {
                await migrateHashToBcrypt(userId, password, api.hashRounds);
            }
        }
        return isValid;
    };
}

function getStateOpts(
    domain,
    ttl,
    sameSite = process.env.NODE_ENV === 'development' ? 'None' : 'Lax'
) {
    return {
        isSecure: process.env.NODE_ENV === 'production',
        strictHeader: false,
        domain: `.${domain}`,
        isSameSite: sameSite,
        path: '/',
        ttl: cookieTTL(ttl)
    };
}

async function associateChartsWithUser(sessionId, userId) {
    /* Sequelize returns [0] when no row was updated */
    if (!sessionId) return [0];

    return Chart.update(
        {
            author_id: userId,
            guest_session: null
        },
        {
            where: {
                author_id: null,
                guest_session: sessionId
            }
        }
    );
}

async function createSession(id, userId, keepSession = true, type = 'password') {
    return Session.create({
        id,
        user_id: userId,
        persistent: keepSession,
        data: {
            'dw-user-id': userId,
            persistent: keepSession,
            last_action_time: Math.floor(Date.now() / 1000),
            type
        }
    });
}

module.exports = {
    legacyHash,
    createHashPassword,
    createComparePassword,
    getStateOpts,
    associateChartsWithUser,
    createSession
};

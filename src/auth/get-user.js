const Boom = require('@hapi/boom');
const { User } = require('@datawrapper/orm/models');

module.exports = async function getUser(userId, { credentials, strategy, logger } = {}) {
    let user = await User.findByPk(userId, {
        attributes: ['id', 'email', 'role', 'language', 'activate_token', 'reset_password_token']
    });

    if (user && user.email === 'DELETED') {
        return { isValid: false, message: Boom.unauthorized('User not found', strategy) };
    }

    if (!user && credentials.session) {
        user = new Proxy(
            { role: 'guest', id: undefined },
            {
                get: (obj, prop) => {
                    if (prop in obj) {
                        return obj[prop];
                    }
                    logger && logger.debug(`Property "${prop}" does not exist on anonymous user.`);
                    return () => {};
                }
            }
        );
    }

    return { isValid: true, credentials, artifacts: user };
};

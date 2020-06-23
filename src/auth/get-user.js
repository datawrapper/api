const Boom = require('@hapi/boom');
const { User } = require('@datawrapper/orm/models');

module.exports = async function getUser(userId, { credentials, strategy, logger } = {}) {
    let user = await User.findByPk(userId, {
        attributes: [
            'id',
            'email',
            'role',
            'language',
            'activate_token',
            'reset_password_token',
            'deleted'
        ]
    });

    if (user && user.deleted) {
        return { isValid: false, message: Boom.unauthorized('User not found', strategy) };
    }

    if (!user && credentials.session) {
        const notSupported = name => {
            return () => {
                logger && logger.warn(`user.${name} is not supported for guests`);
                return false;
            };
        };
        // use non-persistant User model instance
        user = User.build({
            role: 'guest',
            id: undefined,
            language: 'en-US'
        });
        // make sure it never ends up in our DB
        user.save = notSupported('save');
        user.update = notSupported('update');
        user.destroy = notSupported('destroy');
        user.reload = notSupported('reload');
    }

    return { isValid: true, credentials, artifacts: user };
};

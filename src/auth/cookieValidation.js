const Boom = require('boom');
const { Session, User } = require('@datawrapper/orm/models');

module.exports = async function validation(request, session, h) {
    const row = await Session.findByPk(session);

    if (!row) {
        return { isValid: false, message: Boom.unauthorized('Session not found', 'Session') };
    }

    const user = await User.findByPk(row.data['dw-user-id'], {
        attributes: ['id', 'email', 'role']
    });

    if (!user) {
        return { isValid: false, message: Boom.unauthorized('User not found', 'Session') };
    }

    return { isValid: true, credentials: { session }, artifacts: user.dataValues };
};

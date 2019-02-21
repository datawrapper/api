const Boom = require('boom');
const { Session, User } = require('@datawrapper/orm/models');

module.exports = async function validation(request, session, h) {
    const row = await Session.findByPk(session);

    if (!row) {
        return { isValid: false };
    }

    const user = await User.findByPk(row.data['dw-user-id']);

    if (!user) {
        return { isValid: false, message: Boom.unauthorized('User not found') };
    }

    return { isValid: true, credentials: session };
};

const { AuthToken, User } = require('@datawrapper/orm/models');

module.exports = async function validation(request, token, h) {
    const row = await AuthToken.findOne({ where: { token } });

    if (row) {
        const user = await User.findByPk(row.user_id, { attributes: ['id', 'email', 'role'] });
        return { isValid: true, credentials: { token }, artifacts: user.dataValues };
    }

    return { isValid: false, credentials: { token } };
};

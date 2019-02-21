const { AuthToken } = require('@datawrapper/orm/models');

module.exports = async function validation(request, token, h) {
    const row = await AuthToken.findOne({ where: { token } });

    if (row) {
        return { isValid: true, credentials: { token } };
    }

    return { isValid: false, credentials: { token } };
};

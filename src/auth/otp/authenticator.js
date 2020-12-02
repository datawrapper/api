const { authenticator } = require('otplib');
const { getUserData, setUserData, unsetUserData } = require('@datawrapper/orm/utils/userData');
const Boom = require('@hapi/boom');
const USER_DATA_KEY = '.otp_authenticator';

module.exports = {
    id: 'authenticator',
    title: 'Authenticator',

    /*
     * Authenticator OTP doesn't need to be configured
     */
    isEnabled({ config }) {
        return true;
    },

    async isEnabledForUser({ user }) {
        return getUserData(user.id, USER_DATA_KEY);
    },

    /*
     * Check if the authenticated user has enabled OTP
     * and if they do, require a valid OTP for login
     */
    async verify({ user, otp, config }) {
        // check if the user has configured an OTP
        const userOTP = await getUserData(user.id, USER_DATA_KEY);
        if (userOTP) {
            // user has enabled OTP, so we require it
            return authenticator.verify({ token: otp, secret: userOTP });
        }
        return false;
    },

    /*
     * Enable OTP for a user (or reset the otp)
     */
    async enable({ user, otp }) {
        const [secret, token] = otp.split(':');
        if (!authenticator.verify({ token, secret })) {
            throw Boom.unauthorized('Invalid OTP');
        }
        // store authenticator secret
        await setUserData(user.id, USER_DATA_KEY, secret);
    },

    /*
     * Disable OTP login for a given user
     */
    async disable({ user }) {
        await unsetUserData(user.id, USER_DATA_KEY);
    },

    data() {
        return {
            issuer: 'Datawrapper',
            qrcode: true,
            secret: authenticator.generateSecret()
        };
    }
};

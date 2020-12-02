const { promisify } = require('util');
const yub = require('yub');
const yubVerify = promisify(yub.verify);
const { getUserData, setUserData, unsetUserData } = require('@datawrapper/orm/utils/userData');
const Boom = require('@hapi/boom');
const get = require('lodash/get');

const USER_DATA_KEY = '.otp_yubikey';

module.exports = {
    id: 'yubikey',
    title: 'YubiKey',
    /*
     * Returns true if Yubikey client has been configured
     * in config.api.otp.yubikey
     */
    isEnabled({ config }) {
        const api = config('api');
        return get(api, 'otp.yubikey.clientId') && get(api, 'otp.yubikey.secretKey');
    },

    async isEnabledForUser({ user }) {
        return getUserData(user.id, USER_DATA_KEY);
    },

    /*
     * Check if the authenticated user has enabled OTP
     * and if they do, require a valid OTP for login
     */
    async verify({ user, otp, config }) {
        const api = config('api');

        yub.init(api.otp.yubikey.clientId, api.otp.yubikey.secretKey);
        // check if the user has configured an OTP
        const userOTP = await getUserData(user.id, USER_DATA_KEY);
        if (userOTP) {
            // user has enabled OTP, so we require it
            const otpRes = await yubVerify(otp);
            if (otpRes.valid && otpRes.identity === userOTP) {
                return true;
            }
        }
        return false;
    },

    /*
     * Enable OTP for a user (or reset the otp)
     */
    async enable({ user, config, otp }) {
        const api = config('api');
        if (!otp) throw Boom.unauthorized('Need OTP');
        yub.init(api.otp.yubikey.clientId, api.otp.yubikey.secretKey);
        const otpRes = await yubVerify(otp);
        if (!otpRes.valid) {
            throw Boom.unauthorized('Invalid OTP');
        }
        // otp is valid, store device identity
        await setUserData(user.id, USER_DATA_KEY, otpRes.identity);
    },

    /*
     * Disable OTP login for a given user
     */
    async disable({ user }) {
        await unsetUserData(user.id, USER_DATA_KEY);
    }
};

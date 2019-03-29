const generate = require('nanoid/generate');
const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

function cookieTTL(days) {
    return 1000 * 3600 * 24 * days; // 1000ms = 1s -> 3600s = 1h -> 24h = 1d
}

function generateToken(length = 25) {
    return generate(alphabet, length);
}

module.exports = {
    cookieTTL,
    generateToken
};

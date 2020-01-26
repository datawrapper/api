const generate = require('nanoid/generate');
const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

const utils = {};

utils.cookieTTL = days => {
    return 1000 * 3600 * 24 * days; // 1000ms = 1s -> 3600s = 1h -> 24h = 1d
};

utils.generateToken = (length = 25) => {
    return generate(alphabet, length);
};

utils.noop = () => {};

/**
 * returns the domain used for session cookies
 *
 * @param {object} api - the config.api section
 * @returns {string}
 */
utils.cookieDomain = api => {
    // allow manual override of cookie domain
    if (api.cookieDomain) return api.cookieDomain;
    // try to guess the cookie domain from api domain
    // check how many parts the domain has
    const parts = api.domain.split('.');
    // for domains like 'localhost' we return the full
    // api domain, thereby making the cookie impossible to
    // access from the frontend
    if (parts.length < 3) return api.domain;
    // trim off first part and prepend a dot e.g.
    // api.datawrapper.local --> .datawrapper.local
    return '.' + parts.slice(1).join('.');
};

module.exports = utils;

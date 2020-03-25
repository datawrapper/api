const assign = require('assign-deep');
const scopes = {};
const defaultLanguage = 'en_US';

module.exports.addScope = function(scope, messages) {
    if (!scopes[scope]) {
        scopes[scope] = messages;
    } else {
        scopes[scope] = assign(scopes[scope], messages);
    }
};

module.exports.getScope = function(scope, language = 'en_US') {
    if (scopes[scope] && scopes[scope][language]) {
        return scopes[scope][language];
    }
    throw new Error(`Unknown ${scopes[scope] ? 'language' : 'scope'}`);
};

module.exports.translate = function(key, { scope = 'core', language = 'en_US' }) {
    if (scopes[scope]) {
        if (!scopes[scope][language]) {
            language = defaultLanguage;
        }
        return scopes[scope][language][key] || key;
    }
    return key;
};

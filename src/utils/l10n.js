const assign = require('assign-deep');
const scopes = {};
const defaultLanguage = 'en_US';

function getScope(scope, locale = defaultLanguage) {
    if (!scopes[scope]) {
        throw new Error(`Unknown localization scope "${scope}"`);
    }

    if (!scopes[scope][locale]) {
        // try to find locale of same language
        const lang = locale.substr(0, 2);
        locale = Object.keys(scopes[scope]).find(loc => loc.startsWith(lang)) || defaultLanguage;
    }
    if (scopes[scope][locale]) {
        return scopes[scope][locale];
    }
    throw new Error(`Unknown locale "${locale}"`);
}

function addScope(scope, messages) {
    if (scope === 'chart') {
        Object.keys(messages).forEach(key => {
            messages[key.replace('-', '_')] = messages[key];
            delete messages[key];
        });
    }

    if (!scopes[scope]) {
        scopes[scope] = messages;
    } else {
        scopes[scope] = assign(scopes[scope], messages);
    }
}

function translate(key, { scope = 'core', language = 'en_US' }) {
    try {
        const messages = getScope(scope, language);
        return messages[key] || key;
    } catch (e) {
        return key;
    }
}

module.exports = {
    getScope,
    addScope,
    translate
};

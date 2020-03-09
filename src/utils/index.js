const generate = require('nanoid/generate');
const path = require('path');
const jsesc = require('jsesc');
const crypto = require('crypto');
const fs = require('fs-extra');

const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

const utils = {};

utils.stringify = obj => {
    return jsesc(JSON.stringify(obj), {
        isScriptContext: true,
        json: true,
        wrap: true
    });
};

utils.hashFile = async (filePath, hashLength = 8) => {
    const content = await fs.readFile(filePath, { encoding: 'utf-8' });
    let hash = crypto.createHash('sha256');

    hash.update(content);
    hash = hash.digest('hex').slice(0, hashLength);

    const ext = path.extname(filePath);
    return {
        fileName: path.format({
            name: [path.basename(filePath, ext), hash].join('.'),
            ext
        }),
        content
    };
};

utils.cookieTTL = days => {
    return 1000 * 3600 * 24 * days; // 1000ms = 1s -> 3600s = 1h -> 24h = 1d
};

utils.generateToken = (length = 25) => {
    return generate(alphabet, length);
};

utils.noop = () => {};

module.exports = utils;

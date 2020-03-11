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

function createHashedFileName(filePath, hash) {
    const ext = path.extname(filePath);
    const name = [path.basename(filePath, ext), hash].join('.');
    return path.format({ name, ext });
}

utils.copyFileHashed = (filePath, destination, hashLength = 8) => {
    let hash = crypto.createHash('sha256');
    const outFilePath = path.join(destination, path.basename(filePath));
    const input = fs.createReadStream(filePath);
    const output = fs.createWriteStream(outFilePath);

    input.pipe(output);
    input.on('data', chunk => {
        hash.update(chunk);
    });

    return new Promise((resolve, reject) => {
        input.on('error', reject);
        output.on('error', reject);

        output.on('finish', rename);
        async function rename() {
            hash = hash.digest('hex').slice(0, hashLength);
            const hashedFileName = createHashedFileName(filePath, hash);
            await fs.move(outFilePath, path.join(destination, hashedFileName));
            resolve(hashedFileName);
        }
    });
};

utils.readFileAndHash = async (filePath, hashLength = 8) => {
    const content = await fs.readFile(filePath, { encoding: 'utf-8' });
    let hash = crypto.createHash('sha256');

    hash.update(content);
    hash = hash.digest('hex').slice(0, hashLength);

    return {
        fileName: createHashedFileName(filePath, hash),
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

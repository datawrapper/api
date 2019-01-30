const fs = require('fs');
const path = require('path');
const cfgPath = path.resolve(process.cwd(), 'config.js');

if (!fs.existsSync(cfgPath)) {
    console.error('Error: could not find config.js!\n');
    process.exit(1);
}

module.exports = require(cfgPath);

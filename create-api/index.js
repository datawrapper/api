#! /usr/bin/env node
/* eslint no-console: "off" */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const findUp = require('find-up');

const CWD = process.env.INIT_CWD || process.cwd();
let tag = process.argv.find(arg => arg.includes('--tag')) || '--tag=latest';
tag = tag.split('=')[1];

const pkgPath = path.join(CWD, 'package.json');
const pkg = fs.existsSync(pkgPath)
    ? require(pkgPath)
    : {
          name: 'dw-api',
          version: '1.0.0',
          private: true
      };

if (!pkg.scripts) {
    pkg.scripts = {};
}

pkg.scripts.api = 'dw-api';
pkg.scripts.sync = 'dw-sync';

async function main() {
    const configPath = await findUp('config.js');

    if (!configPath) {
        console.log(`
❌ No config.js found!

   Aborting API initialization.
   Please follow the setup instructions for @datawrapper/api.

   https://github.com/datawrapper/api#installation
`);
        process.exit(1);
    }

    const { plugins = {} } = require(configPath);

    const packages = Object.keys(plugins).map(name =>
        plugins[name].version ? `${name}@${plugins[name].version}` : name
    );

    fs.writeFileSync(path.join(CWD, 'package.json'), JSON.stringify(pkg, null, 4), {
        encoding: 'utf-8'
    });

    console.log('[npm] Start package installation.');
    const npm = spawn(
        'npm',
        ['install', '-SE', '--production', `@datawrapper/api@${tag}`].concat(packages)
    );

    npm.stdout.on('data', data => process.stdout.write(data));
    npm.stderr.on('data', data => process.stderr.write(data));

    npm.on('close', () => {
        console.log('\nrun `npm run api` to start the Datawrapper API');
    });
}

main();

#! /usr/bin/env node
/* eslint no-console: "off" */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const findUp = require('find-up');

const CWD = process.env.INIT_CWD || process.cwd();

const pkg = {
    name: 'dw-api',
    version: '1.0.0',
    scripts: {
        start: 'dw-api',
        sync: 'dw-sync'
    }
};

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

    const { plugins } = require(configPath);

    fs.writeFileSync(path.join(CWD, 'package.json'), JSON.stringify(pkg, null, 4), {
        encoding: 'utf-8'
    });

    console.log('[npm] Start package installation.');
    const npm = spawn(
        'npm',
        ['install', '-SE', '--production', '@datawrapper/api@2.0.0-alpha.4'].concat(plugins)
    );

    npm.stdout.on('data', data => process.stdout.write(data));
    npm.stderr.on('data', data => process.stderr.write(data));

    npm.on('close', code => {
        if (code) console.log(`Something went wrong. Code: ${code}`);

        console.log('[npm] Rebuild packages.');
        const rebuild = spawn('npm', ['rebuild', '--build-from-source']);

        rebuild.stdout.on('data', data => process.stdout.write(data));
        rebuild.stderr.on('data', data => process.stderr.write(data));
    });
}

main();

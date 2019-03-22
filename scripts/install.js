#!/usr/bin/env node
/* eslint-env node */
/* eslint no-console: "off" */
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const chalk = require('chalk');

// see https://github.com/npm/npm/issues/16990#issuecomment-349731142
function getProjectDir() {
    if (process.env.INIT_CWD && fs.existsSync(path.resolve(process.env.INIT_CWD, 'config.js'))) {
        console.log('using ' + path.resolve(process.env.INIT_CWD, 'config.js'));
        return process.env.INIT_CWD;
    } else if (fs.existsSync(path.resolve(path.resolve('../../', __dirname), 'config.js'))) {
        console.log('using ' + path.resolve(path.resolve('../../', __dirname), 'config.js'));
        return path.resolve('../../', __dirname);
    } else {
        console.log('skipping install because there is no config.js');
        process.exit();
    }
}

const projectDir = getProjectDir();

// install plugins (in this package)
const cfgPath = path.resolve(projectDir, 'config.js');
const pkgJSON = path.resolve(projectDir, 'package.json');

// add start script to the parent projects package.json
if (fs.existsSync(pkgJSON)) {
    const pkg = JSON.parse(fs.readFileSync(pkgJSON));
    if (!pkg.scripts) pkg.scripts = {};
    pkg.scripts.api = 'datawrapper-api';
    pkg.scripts.sync = 'datawrapper-orm-sync';
    fs.writeFileSync(pkgJSON, JSON.stringify(pkg, null, 2));
    console.log(chalk.green('  package.json updated.'));
    console.log(chalk`  run {yellow npm run api} to start the API`);
    console.log(chalk`  run {yellow npm run sync} to synchronize the db schema\n`);
} else {
    console.error(chalk.red('error: no package.json found'));
    process.exit(1);
}

const config = require(cfgPath);

const packages = Object.keys(config.plugins);

const npm = spawn('npm', ['install', '--no-save', '--production'].concat(packages));

npm.stdout.on('data', data => process.stdout.write(data));
npm.stderr.on('data', data => process.stderr.write(data));

npm.on('close', code => {
    if (code) console.warn(chalk.red(`  plugin install failed. npm exited with code ${code}`));
    console.log(packages.length ? chalk.green(`  ${packages.length} plugins installed.\n`) : '');
});

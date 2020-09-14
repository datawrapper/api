#!/usr/bin/env node
const path = require('path');
const fs = require('fs');
const chalk = require('chalk');
const { exec } = require('child_process');
const arg = require('arg');
const { findConfigPath } = require('@datawrapper/service-utils/findConfig');
const server = require('../src/server.js');

const configPath = findConfigPath();
const config = require(configPath);
const installedPlugins = Object.keys(config.plugins);

// eslint-disable-next-line
const log = console.log;

let args = {};

try {
    args = arg(
        {
            '--help': Boolean,
            '--plugin': [String],
            '--install': [String],
            '--check': Boolean,
            '--list-plugins': Boolean,
            '-p': '--plugin',
            '-i': '--install',
            '-c': '--check',
            '-l': '--list-plugins'
        },
        { permissive: true }
    );
} catch (error) {
    console.error(error.message);
    process.exit(1);
}

async function go() {
    if (args['--list-plugins']) {
        log(chalk`{bold Plugin directory:}
${config.general.localPluginRoot}
{bold Installed plugins:}`);
        installedPlugins.forEach(p => log(`  - ${p}`));
        process.exit(0);
    }

    if (args['--plugin'] && args['--plugin'].length) {
        let plugins = args['--plugin']
            .map(p => p.split('@'))
            .filter(([p]) => installedPlugins.includes(p) || 'all');

        if (plugins.includes('all')) {
            plugins = installedPlugins;
        }

        for (const [name, branch] of plugins) {
            try {
                await updatePlugin([name, branch]);
                log(chalk`\n{bold.green [${name}] ✅  Done}\n`);
            } catch (error) {
                console.error(chalk.reset.grey(error));
                console.error(chalk`{bold.red [${name}] Error updating plugin.}\n`);
            }
        }
    }

    if (args['--install']) {
        await installPlugins();
    }

    if (args['--check']) {
        await server.start();
    }
}

go();

function run(cmd) {
    return new Promise((resolve, reject) => {
        const command = exec(cmd, (error, stdout, stderr) => {
            if (error) {
                console.error(chalk.reset.grey(stderr));
                reject(error.code);
            }
        });

        command.stdout.on('data', data => {
            log(chalk.reset.grey(data.endsWith('\n') ? data.slice(0, -2) : data));
        });
        command.on('close', code => {
            resolve();
        });
    });
}

async function updatePlugin([name, branch] = []) {
    const pluginPath = path.join(config.general.localPluginRoot, name);

    if (!branch) {
        branch = fs
            .readFileSync(path.join(pluginPath, '.git/HEAD'), { encoding: 'utf-8' })
            .split('heads/')[1];

        if (!branch) {
            throw new Error(`Could not determine current branch. You are likely in "detached HEAD" mode.
Your problem might get solved by specifying a branch, like this:

dw-update -p ${name}@{branch}

It is possible to fix the problem manually in ${pluginPath}.
Try running "git status" and it will print if you are in "detached HEAD" mode.`);
        }

        branch = branch.trim();
    }

    log(chalk`{bold.green [${name}]} Updating {grey (${branch})}`);

    await run(`cd ${pluginPath} && git checkout -B ${branch} -t origin/${branch}`);
    await run(`cd ${pluginPath} && git pull`);

    await installDependencies(name, pluginPath);
}

async function installPlugins() {
    log(chalk`{bold.cyan Installing new plugins}\n`);
    const newPlugins = args['--install']
        .map(p => p.split('@'))
        .filter(([name]) => {
            if (installedPlugins.includes(name)) {
                log(chalk`{bold.yellow [${name}]} Skipping installation (already installed)`);
                return false;
            }
            return true;
        });

    if (!newPlugins.length) {
        log(chalk`{bold.yellow Nothing to install.}`);
    }

    for (const [name] of newPlugins) {
        await clonePlugin(name);
    }
}

async function clonePlugin(name) {
    let repo;
    try {
        log(chalk`{bold.cyan [${name}]} Searching (datawrapper/plugin-${name})`);
        await run(`git ls-remote git@github.com:datawrapper/plugin-${name}.git`);
        repo = `datawrapper/plugin-${name}`;
    } catch (error) {
        try {
            log(chalk`{bold.cyan [${name}]} Searching (datawrapper/${name})`);
            await run(`git ls-remote git@github.com:datawrapper/${name}.git`);
            repo = `datawrapper/${name}`;
        } catch (error) {
            console.error(chalk`{bold.red [${name}] Repository does not exist.}`);
        }
    }
    log(chalk`{bold.green [${name}]} Found repository (${repo})`);

    log(chalk`{bold.cyan [${name}]} Cloning repository (${repo})`);
    const pluginPath = path.join(config.general.localPluginRoot, name);
    try {
        await run(`git clone git@github.com:${repo}.git ${pluginPath}`);
        log(chalk`{bold.green [${name}]} Cloned repository (${pluginPath})`);
    } catch (error) {
        console.error(chalk`{bold.red [${name}] Error cloning the repository.}`);
        return;
    }

    await installDependencies(name, pluginPath);

    log(chalk`{bold.grey [${name}] Don't forget to activate the plugin in the [plugins] section of
${configPath}}`);
}

async function installDependencies(name, pluginPath) {
    if (fs.existsSync(path.join(pluginPath, 'package-lock.json'))) {
        log(chalk`{bold.green [${name}]} Installing dependencies`);

        await run(`cd ${pluginPath} && npm ci --production`);
    } else {
        log(chalk`{bold.yellow [${name}]} Skipping dependencies (no package-lock.json)`);
    }
}

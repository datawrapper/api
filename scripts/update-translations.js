#!/usr/bin/env node

const got = require('got');
const fs = require('fs');
const { writeFile, readFile } = require('fs/promises');
const path = require('path');
const { requireConfig } = require('@datawrapper/service-utils/findConfig');
const chalk = require('chalk');
require('dotenv').config({
    path: path.resolve(__dirname, '../../../utils/docker/.datawrapper_env')
});
const config = requireConfig();
const get = require('lodash/get');
const isEqual = require('lodash/isEqual');
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});
const question = promisify(rl.question).bind(rl);

if (!get(config, 'general.lokalise') || !get(config, 'general.lokalise.token')) {
    return console.error('Please configure lokalise in your config.js!');
}

const cfg = get(config, 'general.lokalise');

const NO_GIT_CHECK = process.argv.includes('--no-git-check');
const PREFIX = (process.argv.find(d => d.startsWith('--prefix=')) || '=').split('=')[1] || false;

// lokalise locales to datawrapper locales
const localeMap = {
    en: 'en_US',
    de: 'de_DE',
    fr: 'fr_FR',
    it: 'it_IT',
    zh_CN: 'zh_CN',
    es_ES: 'es_ES'
};

const dwLocales = {
    en_US: {},
    de_DE: {},
    fr_FR: {},
    it_IT: {},
    zh_CN: {},
    es_ES: {}
};

async function download(project, branch) {
    const res = await got(
        `https://api.lokalise.com/api2/projects/${project}:${branch}/keys?include_translations=1&limit=5000`,
        {
            headers: {
                'x-api-token': cfg.token
            }
        }
    );

    return JSON.parse(res.body);
}

async function downloadCoreTranslations() {
    const body = await download(cfg.projects.core.id, cfg.projects.core.branch);
    const locales = JSON.parse(JSON.stringify(dwLocales));

    process.stdout.write(chalk`
{blue Found ${body.keys.length} keys for core.}`);

    for (const key of body.keys) {
        for (const translation of key.translations) {
            locales[localeMap[translation.language_iso]][key.key_name.web] =
                translation.translation;
        }
    }

    for (const locale in locales) {
        const file = `${path.resolve(__dirname, '../../datawrapper/locale')}/${locale}.json`;
        await writeTranslationsIfGitClean(file, locales[locale]);

        const apiFile = `${path.resolve(__dirname, '../locale')}/${locale}.json`;
        await writeTranslationsIfGitClean(apiFile, locales[locale]);

        const frontendFile = `${path.resolve(__dirname, '../../frontend/locale')}/${locale}.json`;
        await writeTranslationsIfGitClean(frontendFile, locales[locale]);
    }
}

async function downloadPluginTranslations() {
    const body = await download(cfg.projects.plugins.id, cfg.projects.plugins.branch);
    const plugins = {};

    process.stdout.write(chalk`
{blue Found ${body.keys.length} keys for all plugins.}`);

    for (const key of body.keys) {
        const pluginName = key.key_name.web.split(' / ')[1];
        const rawKey = key.key_name.web.replace(`plugins / ${pluginName} / `, '');

        for (const translation of key.translations) {
            if (!plugins[pluginName]) plugins[pluginName] = JSON.parse(JSON.stringify(dwLocales));
            plugins[pluginName][localeMap[translation.language_iso]][rawKey] =
                translation.translation;
        }
    }

    for (const plugin in plugins) {
        const pluginLocaleDir = `${path.resolve(__dirname, `../../../plugins/${plugin}/locale`)}`;

        if (!fs.existsSync(pluginLocaleDir)) {
            // process.stdout.write(chalk`{red Could not update translations for plugin ${plugin}.}`);
            continue;
        }

        for (const locale in plugins[plugin]) {
            const file = `${pluginLocaleDir}/${locale}.json`;
            await writeTranslationsIfGitClean(file, plugins[plugin][locale]);
        }
    }
}

async function downloadVisualizationTranslations() {
    const body = await download(cfg.projects.visualizations.id, cfg.projects.visualizations.branch);
    const plugins = {};

    process.stdout.write(chalk`
{blue Found ${body.keys.length} keys for visualizations.}`);

    for (const key of body.keys) {
        const pluginName = key.key_name.web.split(' / ')[1];
        const rawKey = key.key_name.web.replace(`plugins / ${pluginName} / `, '');

        for (const translation of key.translations) {
            const locale =
                translation.language_iso === 'ca'
                    ? 'ca-ES'
                    : translation.language_iso.replace('_', '-');

            if (!plugins[pluginName]) plugins[pluginName] = {};
            if (!plugins[pluginName][locale]) plugins[pluginName][locale] = {};

            plugins[pluginName][locale][rawKey] = translation.translation;
        }
    }

    for (const plugin in plugins) {
        for (var locale in plugins[plugin]) {
            for (var key in plugins[plugin]['en-US']) {
                if (
                    typeof plugins[plugin][locale][key] === 'undefined' ||
                    plugins[plugin][locale][key].trim() === ''
                ) {
                    const language = locale.split('-')[0];
                    const alternative = Object.keys(plugins[plugin]).find(
                        d => d !== locale && d.split('-')[0] === language && plugins[plugin][d][key]
                    );
                    plugins[plugin][locale][key] = plugins[plugin][alternative || 'en-US'][key];
                }
            }
        }

        const pluginLocaleDir = `${path.resolve(__dirname, `../../../plugins/${plugin}/locale`)}`;

        if (!fs.existsSync(pluginLocaleDir)) {
            // process.stdout.write(chalk`{red Could not update visualization translations for plugin ${plugin}.}`);
            continue;
        }

        const file = `${pluginLocaleDir}/chart-translations.json`;
        await writeTranslationsIfGitClean(file, plugins[plugin]);
    }
}

async function go() {
    await downloadCoreTranslations();
    await downloadPluginTranslations();
    await downloadVisualizationTranslations();
    await commitNewTranslations();
}

const gitFetchCache = new Set();
const gitStatusCache = new Map();
const gitNewChanges = new Map();

async function writeTranslationsIfGitClean(file, translations) {
    if (PREFIX && !file.startsWith(PREFIX)) {
        // ignore fle
        return;
    }
    // read existing translations and compare
    if (fs.existsSync(file)) {
        const curTranslations = JSON.parse(await readFile(file, 'utf-8'));
        if (isEqual(curTranslations, translations)) {
            // no changes
            return;
        }
    }
    const repoPath = path.dirname(path.join(file, '../'));
    const repoName = path.basename(repoPath);

    if (!NO_GIT_CHECK) {
        // fetch latest origin
        if (!gitFetchCache.has(repoPath)) {
            process.stdout.write(chalk`
{white New translations found for ${repoName}.}`);
            // run git fetch
            await exec('git fetch origin', { cwd: repoPath, shell: true });
            gitFetchCache.add(repoPath);
        }
        // check that git status is empty (= clean repo)
        if (!gitStatusCache.has(repoPath)) {
            const { stdout: gitStatus } = await await exec('git status', {
                cwd: repoPath,
                shell: true
            });
            gitStatusCache.set(repoPath, gitStatus);
        }
        if (
            !gitStatusCache.get(repoPath).includes('Your branch is up to date with') &&
            !gitStatusCache.get(repoPath).includes('Your branch is ahead of')
        ) {
            process.stdout.write(chalk`
{red ${repoName} is not clean, please run git pull before updating translations.}`);
            return;
        }
    }

    await writeFile(file, JSON.stringify(translations, null, 2));

    if (!NO_GIT_CHECK) {
        if (!gitNewChanges.has(repoPath)) {
            gitNewChanges.set(repoPath, []);
            process.stdout.write(chalk`
    {green Updated translations for ${repoName}.}`);
        }
        gitNewChanges.get(repoPath).push(path.relative(repoPath, file));
    }
}

async function commitNewTranslations() {
    process.stdout.write('\n');
    for (const [repoPath, files] of gitNewChanges.entries()) {
        const repoName = path.basename(repoPath);
        process.stdout.write(chalk`
{white There are ${files.length} updated translation files in ${repoName}.}\n`);
        try {
            await question('  Do you want to commit them now? [y/N]  ');
        } catch (answer) {
            if (answer && answer.toLowerCase() === 'y') {
                // make sure all translation files are in version control
                const addCmd = `git add -- ${files.join(' ')}`;
                await exec(addCmd, { cwd: repoPath, shell: true });
                // commit changes
                const commitCmd = `git commit -m "l10n: update translations" -- ${files.join(' ')}`;
                const { stderr } = await exec(commitCmd, { cwd: repoPath, shell: true });
                if (stderr) process.stderr.write(stderr);
                else {
                    process.stdout.write(chalk`{green ok}`);
                }
            }
            // rejected
        }
    }
    rl.close();
}

go();

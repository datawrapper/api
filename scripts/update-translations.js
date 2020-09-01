#!/usr/bin/env node

const got = require('got');
const fs = require('fs');
const path = require('path');
const { requireConfig } = require('@datawrapper/shared/node/findConfig');
const chalk = require('chalk');
const config = requireConfig();

if (!config.lokalise || !config.lokalise.token) {
    return console.error('Please configure lokalise in your config.js!');
}

const cfg = config.lokalise;

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
        fs.writeFileSync(file, JSON.stringify(locales[locale]));

        const apiFile = `${path.resolve(__dirname, '../locale')}/${locale}.json`;
        fs.writeFileSync(apiFile, JSON.stringify(locales[locale]));
    }

    process.stdout.write(chalk`
{green Updated translations for core & API.}`);
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
            process.stdout.write(chalk`
{red Could not update translations for plugin ${plugin}.}`);
            continue;
        }

        for (const locale in plugins[plugin]) {
            const file = `${pluginLocaleDir}/${locale}.json`;
            fs.writeFileSync(file, JSON.stringify(plugins[plugin][locale]));
        }

        process.stdout.write(chalk`
{green Updated translations for plugin ${plugin}.}`);
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
                    plugins[plugin][locale][key] = plugins[plugin]['en-US'][key];
                }
            }
        }

        const pluginLocaleDir = `${path.resolve(__dirname, `../../../plugins/${plugin}/locale`)}`;

        if (!fs.existsSync(pluginLocaleDir)) {
            process.stdout.write(chalk`
{red Could not update visualization translations for plugin ${plugin}.}`);
            continue;
        }

        const file = `${pluginLocaleDir}/chart-translations.json`;
        fs.writeFileSync(file, JSON.stringify(plugins[plugin]));

        process.stdout.write(chalk`
{green Updated visualization translations for plugin ${plugin}.}`);
    }
}

async function go() {
    await downloadCoreTranslations();
    await downloadPluginTranslations();
    await downloadVisualizationTranslations();
}

go();

const fs = require('fs-extra');
const path = require('path');
const less = require('less');
const postcssLess = require('postcss-less');
const pCSS = require('postcss');

/* needed for variable parsing, otherwise postcss logs annoying messages we don't care about */
const { noop } = require('../utils/index.js');
const CSS_ELIMINATION_KEYWORD = '__UNDEFINED__';

const postcss = pCSS([
    /* removes all declarations with value of CSS_ELIMINATION_KEYWORD */
    require('./postcss-plugin-remove-declaration')(CSS_ELIMINATION_KEYWORD),
    /* sets px unit for all unitless values (12 -> 12px) */
    require('postcss-default-unit')({ ignore: { 'stroke-opacity': true, 'font-family': true } }),
    /* vendor prefixes for older browsers */
    require('autoprefixer'),
    /* css minification and dead code elimination */
    require('cssnano')({ preset: ['default', { svgo: false }] })
]);

module.exports = { compileCSS, findLessVariables, createFontEntries, flatten };

/**
 * Compile and concatenate .less files to CSS and run some code optimizations with PostCSS.
 *
 * @param {Object} options Options to create chart CSS
 * @param {Object} options.fonts Collection of fonts the chart theme uses
 * @param {Object} options.theme Chart theme object
 * @param {string} options.filePaths Path to some Less files
 * @param {string[]} options.paths List of paths to look in for less `@import` statements
 * @returns {string} CSS string
 */
async function compileCSS({ theme, filePaths }) {
    const paths = filePaths.map(path.dirname);

    const lessString = (await Promise.all(filePaths.map(saveReadFile))).join('');

    const lessVariables = await findLessVariables(lessString, { paths });
    let varString = '';
    for (const variable of lessVariables) {
        varString = varString.concat(`${variable}: ${CSS_ELIMINATION_KEYWORD};`);
    }

    const inputLess = [varString, createFontEntries(theme.fonts), lessString, theme.less].join('');

    let { css } = await less.render(inputLess, {
        paths: paths,
        modifyVars: flatten({
            typography: theme.data.typography,
            style: theme.data.style,
            options: theme.data.options,
            colors: theme.data.colors,
            vis: theme.data.vis,
            maps: theme.data.maps
        })
    });

    css = (await postcss.process(css, { from: undefined })).css;

    return css;
}

function createFontEntries(fonts) {
    return Object.entries(fonts)
        .map(([font, attr]) => {
            switch (attr.method) {
                case 'file':
                case 'url':
                    return `
@font-face {
    font-family: '${font}';
         url('${attr.files.woff}')  format('woff'),      /* Pretty Modern Browsers */
         url('${attr.files.ttf}')   format('truetype');  /* Safari, Android, iOS */
         url('${attr.files.svg}#${font}')   format('svg');
}`;
                case 'import':
                    return `@import '${attr.import}';`;
                default:
                    return '';
            }
        })
        .join('\n');
}

function saveReadFile(filePath) {
    return fs.readFile(filePath, { encoding: 'utf-8' }).catch(() => '');
}

async function findLessVariables(less, { files = [], paths } = {}) {
    const lessVariables = new Set();
    let lessStyles = [less];

    if (files.length) {
        const importedLess = await Promise.all(files.map(saveReadFile));
        lessStyles = lessStyles.concat(importedLess);
    }

    function matchLessVariable(string) {
        const varRegex = /@[\w\d{}-]*/g;
        const match = string.match(varRegex);
        if (match) {
            match.forEach(variable => {
                /* variable name doesn't have curly braces, replace them */
                lessVariables.add(variable.replace(/[{}]/g, ''));
            });
        }
    }

    /* Search for variables and other imports in all passed less files */
    for (const lessString of lessStyles) {
        const { root } = pCSS([noop]).process(lessString, { syntax: postcssLess }).result;
        const files = [];

        root.walkDecls(decl => matchLessVariable(decl.value));
        root.walkRules(rule => matchLessVariable(rule.selector));
        root.walkAtRules(rule => {
            /* when we find an @import rule we push it into the files array to search more variables */
            if (rule.name === 'import') {
                /*
                 * Capture file name in import path
                 *
                 * "'common.less'" -> "common.less"
                 * "(less) 'common.less'" -> "common.less"
                 */
                paths.forEach(p => {
                    const file = path.join(p, rule.params.replace(/(?:.*'(.*)')/g, '$1'));
                    files.push(file);
                });
            }
        });

        if (files.length) {
            /* search more variables in imported files */
            const importedFiles = await findLessVariables('', { files, paths });
            /* add them to the less variables Set */
            importedFiles.forEach(v => lessVariables.add(v));
        }
    }

    return lessVariables;
}

/**
 * Slightly modified version of https://stackoverflow.com/a/19101235 to flatten a deep object.
 * Deep keys are getting concatenated with an underscore.
 *
 * @example
 * flatten({ foo: { bar: 'baz' } })
 * // -> { foo_bar: 'baz' }
 *
 * @param {Object} data - deep nested object
 * @returns {Object} - flat object
 */
function flatten(data) {
    const result = {};
    function recurse(cur, prop) {
        if (Object(cur) !== cur) {
            result[prop] = cur;
        } else {
            let isEmpty = true;
            for (const p in cur) {
                isEmpty = false;
                recurse(cur[p], prop ? prop + '_' + p : p);
            }
            if (isEmpty && prop) result[prop] = {};
        }
    }
    recurse(data, '');
    return result;
}

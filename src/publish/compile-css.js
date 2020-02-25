const fs = require('fs');
const path = require('path');
const util = require('util');
const less = require('less');
const postcssLess = require('postcss-less');
const pCSS = require('postcss');

/* needed for variable parsing, otherwise postcss logs annoying messages we don't care about */
const noopPlugin = () => {};
const CSS_ELIMINATION_KEYWORD = '__UNDEFINED__';

const readFile = util.promisify(fs.readFile);

const postcss = pCSS([
    /* removes all declarations with value of CSS_ELIMINATION_KEYWORD */
    require('./postcss-plugin-remove-declaration')(CSS_ELIMINATION_KEYWORD),
    /* sets px unit for all unitless values (12 -> 12px) */
    require('postcss-default-unit')({ ignore: { 'stroke-opacity': true } }),
    /* vendor prefixes for older browsers */
    require('autoprefixer'),
    /* css minification and dead code elimination */
    require('cssnano')({ preset: ['default', { svgo: false }] })
]);

module.exports = { compileCSS };

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
async function compileCSS({ fonts, theme, filePaths, paths }) {
    let inputLess = createFontEntries(fonts);
    const [lessString, lessVariables] = await Promise.all([
        loadLess(filePaths, theme.less),
        findLessVariables({ files: filePaths, customLess: theme.less, paths })
    ]);

    const varString = Array.from(lessVariables)
        .map(variable => `${variable}: ${CSS_ELIMINATION_KEYWORD};`)
        .join('\n');

    inputLess = [varString, inputLess, lessString].join('\n');
    let css = await compileLess(inputLess, theme, paths);
    css = (await postcss.process(css, { from: undefined })).css;

    return css;
}

function createFontFaceRule(font, attr) {
    return `@font-face {
  font-family: '${font}';
  src: url('${attr.files.woff2}') format('woff2'),     /* Super Modern Browsers */
       url('${attr.files.woff}')  format('woff'),      /* Pretty Modern Browsers */
       url('${attr.files.ttf}')   format('truetype');  /* Safari, Android, iOS */
  }`;
}

function createFontEntries(fonts) {
    return Object.entries(fonts)
        .map(([font, attr]) => {
            switch (attr.method) {
                case 'file':
                case 'url':
                    return createFontFaceRule(font, attr);
                case 'import':
                    return `@import '${attr.import}';`;
                default:
                    return '';
            }
        })
        .join('\n');
}

async function loadLess(filePaths, customLess) {
    const lessStyles = await Promise.all(filePaths.map(p => readFile(p, { encoding: 'utf-8' })));

    lessStyles.push(customLess);
    return lessStyles.join('\n');
}

function saveReadFile(filePath) {
    return readFile(filePath, { encoding: 'utf-8' }).catch(() => '');
}

async function findLessVariables({ files, customLess, paths }) {
    const lessVariables = new Set();
    const lessStyles = files.length ? await Promise.all(files.map(saveReadFile)) : [];

    if (customLess) {
        lessStyles.push(customLess);
    }

    function matchLessVariable(string) {
        const varRegex = /@[\w\d{}-]*/g;
        const match = string.match(varRegex);
        if (match) {
            /* variable name doesn't have curly braces, replace them */
            const variables = match.map(v => v.replace(/[{}]/g, ''));
            /* build a unique array of variables from this declaration and add them all to lessVariables */
            Array.from(new Set(variables)).forEach(variable => lessVariables.add(variable));
        }
    }

    /* Search for variables and other imports in all passed less files */
    for (const lessString of lessStyles) {
        const { root } = pCSS([noopPlugin]).process(lessString, {
            syntax: postcssLess
        }).result;
        const files = [];

        root.walkDecls(decl => matchLessVariable(decl.value));
        root.walkRules(rule => matchLessVariable(rule.selector));
        root.walkAtRules(rule => {
            /* when we find an @import rule we push it into the files array to search more variables */
            if (rule.name === 'import') {
                const file = path.join(
                    paths[0],
                    rule.params /* eg.: `'common.less'` or `(less) 'common.less'` */
                        .split(' ')
                        .pop() /* remove `(less)` part and only return the file name in single quotes */
                        .replace(/'/g, '') /* remove single quotes */
                );

                files.push(file);
            }
        });
        if (files.length) {
            /* search more variables in imported files */
            const importedFiles = await findLessVariables({ files, paths });
            /* add them to the less variables Set */
            importedFiles.forEach(v => lessVariables.add(v));
        }
    }

    return lessVariables;
}

async function compileLess(lessString, theme, paths) {
    const { css } = await less.render(lessString, {
        paths: paths,
        modifyVars: flatten({
            typography: theme.data.typography,
            style: theme.data.style,
            colors: theme.data.colors,
            vis: theme.data.vis,
            maps: theme.data.maps
        })
    });

    return css;
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

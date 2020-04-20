const test = require('ava');

const { findLessVariables, createFontEntries, flatten } = require('./compile-css.js');

test('should create font rule declarations', t => {
    let result = createFontEntries({
        Roboto: {
            type: 'font',
            import: 'https://static.dwcdn.net/css/roboto.css',
            method: 'import'
        }
    });

    t.is(result, "@import 'https://static.dwcdn.net/css/roboto.css';");

    result = createFontEntries({
        Font: {
            type: 'font',
            files: {
                ttf: '/font.ttf',
                woff: '/font.woff',
                woff2: '/font.woff2'
            },
            method: 'url'
        }
    });

    t.snapshot(result);
});

test('should flatten a nested theme object', t => {
    const result = flatten({
        colors: { general: { padding: 0 } },
        options: {
            footer: { logo: { height: 30 } },
            typography: { chart: { color: '#333333' } }
        }
    });

    t.deepEqual(result, {
        colors_general_padding: 0,
        options_footer_logo_height: 30,
        options_typography_chart_color: '#333333'
    });
});

test('should find variables in less string', async t => {
    const less = `.chart {
        font-family: @typography_chart_typeface;

        color: @colors_text;
        color: @typography_chart_color;

        text-shadow: ~'-1px -1px 2px @{colors_background}';

    }`;

    const result = await findLessVariables(less);

    t.deepEqual(Array.from(result), [
        '@typography_chart_typeface',
        '@colors_text',
        '@typography_chart_color',
        '@colors_background'
    ]);
});

const test = require('ava');

const { findLessVariables, createFontEntries, flatten } = require('./compile-css.js');

test('should create font rule declarations', t => {
    const fontFiles = {
        Font: {
            type: 'font',
            files: {
                svg: '/font.svg',
                ttf: '/font.ttf',
                woff: '/font.woff',
                woff2: '/font.woff2'
            },
            method: 'url'
        },
        FontBold: {
            type: 'font',
            files: {
                svg: '/fontBold.svg',
                ttf: '/fontBold.ttf',
                woff: '/fontBold.woff',
                woff2: '/fontBold.woff2'
            },
            method: 'url'
        },
        FontItalic: {
            type: 'font',
            files: {
                svg: '/fontItalic.svg',
                ttf: '/fontItalic.ttf',
                woff: '/fontItalic.woff',
                woff2: '/fontItalic.woff2'
            },
            method: 'url'
        }
    };

    const additionalFont = {
        type: 'font',
        files: {
            svg: '/anotherFontBold.svg',
            ttf: '/anotherFontBold.ttf',
            woff: '/anotherFontBold.woff',
            woff2: '/anotherFontBold.woff2'
        },
        method: 'url'
    };

    const importedFont = {
        type: 'font',
        import: 'https://static.dwcdn.net/css/roboto.css',
        method: 'import'
    };

    const themeData = {
        typography: {
            fontFamilies: {
                Font: [
                    {
                        name: 'Font',
                        style: 'normal',
                        weight: 400
                    },
                    {
                        name: 'FontBold',
                        style: 'normal',
                        weight: 'bold'
                    },
                    {
                        name: 'FontItalic',
                        style: 'italic',
                        weight: 400
                    }
                ]
            }
        }
    };

    // css for imported font
    let result = createFontEntries({
        Roboto: importedFont
    });

    t.is(result, "@import 'https://static.dwcdn.net/css/roboto.css';");

    // css for font file, (no font families defined)
    result = createFontEntries({
        Font: fontFiles.Font
    });

    t.snapshot(result);

    // css for mixed font files (no font families defined) and imported font
    result = createFontEntries(Object.assign(fontFiles, { Roboto: importedFont }));

    t.snapshot(result);

    // css for font files with font families defined
    result = createFontEntries(fontFiles, themeData);

    t.snapshot(result);

    // css for font files with mix of font famlies defined, and not
    result = createFontEntries(
        Object.assign(fontFiles, { AnotherFontBold: additionalFont }),
        themeData
    );

    t.snapshot(result);
});

test('should change a css @import without protocol to use https', t => {
    const result = createFontEntries({
        Roboto: {
            type: 'font',
            import: '//static.dwcdn.net/css/roboto.css',
            method: 'import'
        }
    });

    t.is(result, "@import 'https://static.dwcdn.net/css/roboto.css';");
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

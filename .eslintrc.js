module.exports = {
    env: {
        node: true,
        commonjs: true
    },
    parser: 'babel-eslint',
    extends: 'standard',
    globals: {
        Reflect: true,
        Promise: true
    },
    rules: {
        'no-sequences': 'error',
        eqeqeq: ['error', 'smart'],
        'no-multiple-empty-lines': ['error', { max: 2 }],
        'no-console': ['error', { allow: ['warn', 'error'] }],
        indent: ['error', 4],
        semi: ['error', 'always']
    }
};

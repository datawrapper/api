const postcss = require('postcss');

module.exports = postcss.plugin('postcss-plugin-remove-declaration', keyword => {
    return root => {
        root.walkDecls(decl => {
            if (decl.value.includes(keyword)) decl.remove();
        });
    };
});

module.exports = keyword => {
    return {
        postcssPlugin: 'postcss-plugin-remove-declaration',
        Once(root) {
            root.walkDecls(decl => {
                if (decl.value.includes(keyword)) decl.remove();
            });
        }
    };
};

module.exports.postcss = true;

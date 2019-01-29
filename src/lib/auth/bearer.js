const { AuthToken } = require('@datawrapper/orm/models');
const asyncHandler = require('../asyncHandler');

module.exports = asyncHandler(async (req, res, next) => {
    const auth = req.get('Authentication');
    if (auth) {
        const [type, token] = auth.split(' ');
        if (type.toLowerCase() === 'bearer') {
            if (token) {
                const at = await AuthToken.findOne({ where: { token: token.trim() } });
                if (!at) return next('Authentication failed. Unknown Bearer token!');

                const user = await at.getUser();
                res.locals.user = user;

                const plugins = await user.getPlugins();
                res.locals.plugins = plugins;
                next();
            } else {
                next(`Authentication failed. Bearer token must not be empty!`);
            }
        } else {
            next(`Authentication failed. Unsupported authentication type '${type}'!`);
        }
    } else {
        next();
    }
});

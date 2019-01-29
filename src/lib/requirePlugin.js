const requireUser = require('./requireUser');

module.exports = pluginId => {
    return (req, res, next) => {
        // private plugins require authentication
        if (!res.locals.user) {
            return requireUser(req, res, next);
        }

        const allowedPlugins = res.locals.plugins.map(d => d.id);
        const allow = allowedPlugins.indexOf(pluginId) > -1;

        if (allow) return next();

        return res.status(403).send({
            error: 'Your account is lacking privileges to access this endpoint.'
        });
    };
};

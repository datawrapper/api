const requireUser = require('./requireUser');

module.exports = (plugin_id) => {
    return (req, res, next) => {
        // private plugins require authentication
        if (!res.locals.user) {
            return requireUser(req, res, next);
        }

        const allowed_plugins = res.locals.plugins.map(d => d.id);
        const allow = allowed_plugins.indexOf(plugin_id) > -1;

        if (allow) return next();

        return res.status(403).send({
            error: 'Your account is lacking privileges to access this endpoint.'
        });
    };
}

module.exports = (plugin_id) => {
    return async (req, res, next) => {
        const allow = await res.user.mayUsePlugin(plugin_id);
        if (!allow) {
            return res.status(403).send({
                error: 'Your account is lacking privileges to access this endpoint.'
            });
        }
        next();
    };
}

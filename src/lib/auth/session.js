const {Session, User} = require('datawrapper-orm/models');
const asyncHandler = require('../asyncHandler');

module.exports = asyncHandler(async (req, res, next) => {
    if (req.cookies['DW-SESSION']) {
        const session = await Session.findByPk(req.cookies['DW-SESSION']);
        if (session) {
            if (session.data['dw-user-id']) {
                const user = await User.findByPk(session.data['dw-user-id']);
                if (user) {

                    res.locals.user = user;

                    const plugins = await user.getPlugins();
                    res.locals.plugins = plugins;

                    next();
                } else {
                    next('Authentication error: user not found');
                }
            } else {
                // guest session
                next();
            }
        } else {
            next('Authentication error: invalid session id');
        }
    } else {
        next();
    }
});

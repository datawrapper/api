const {Session, User} = require('datawrapper-orm/models');

module.exports = async (req, res, next) => {
    if (req.cookies['DW-SESSION']) {
        const session = await Session.findByPk(req.cookies['DW-SESSION']);
        if (session) {
            if (session.data['dw-user-id']) {
                const user = await User.findByPk(session.data['dw-user-id']);
                if (user) {
                    res.user = user;
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
    }
    next();
}

module.exports = (req, res, next) => {
    if (!res.locals.user) {
        return res.status(401).send({
            error: 'This endpoint requires authentication'
        });
    }
    if (res.locals.user.role != 'admin' && res.locals.user.role != 'sysadmin') {
    	return res.status(403).send({
    	    error: 'You\'re not allowed to access this endpoint.'
    	});
    }
    next();
};

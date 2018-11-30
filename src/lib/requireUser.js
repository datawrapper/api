module.exports = (req, res, next) => {
	if (!res.user) return next('This endpoint requires authentication');
	next();
};

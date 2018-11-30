module.exports = (req, res, next) => {
	if (!res.user) {
		return res.status(403).send({
			error: 'This endpoint requires authentication'
		});
	}
	next();
};

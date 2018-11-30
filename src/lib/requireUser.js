module.exports = (req, res, next) => {
	if (!res.user) {
		res.status(403).send({
			error: 'This endpoint requires authentication'
		});
	}
	next();
};

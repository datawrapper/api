module.exports = (req, res, next) => {
    if (!res.user) {
        return res.status(401).send({
            error: 'This endpoint requires authentication'
        });
    }
    next();
};

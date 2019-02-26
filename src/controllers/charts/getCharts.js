const { Chart } = require('@datawrapper/orm/models');
const requireUser = require('../../lib/requireUser');

module.exports = (req, res) => {
	let where = { deleted: 0 };
	if (res.locals.user) {
		// user is signed in, return the users charts
		where.author_id = res.locals.user.id;
	} else if (res.locals.session) {
		// guest session. return the guests chart
		where.guest_session = res.locals.session.id;
	} else {
		return requireUser(req, res);
	}

	Chart.findAll({
		where: where,
		order: [['last_modified_at', 'DESC']],
		limit: 100
	})
		.then(charts => {
			res.status(200).send(charts);
		})
		.catch(err => {
			console.warn(err);
			res.status(500).send('There was a problem finding the charts.');
		});
};

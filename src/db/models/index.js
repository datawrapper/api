const db = require('../db');

module.exports = {
	Chart: require('./Chart')(db)
}

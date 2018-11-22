const db = require('../db');

module.exports = {
	Chart: require('./Chart')(db),
	ExportJob: require('./ExportJob')(db),
}

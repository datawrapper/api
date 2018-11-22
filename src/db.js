// const mysql = require('mysql');
const Sequelize = require('sequelize');
const config = require('../config');

const sequelize = new Sequelize(
	config.db.database,
	config.db.user,
	config.db.password, {
		host: config.db.host,
		port: config.db.port,
		dialect: config.db.dialect,
		operatorsAliases: false
	},
);

module.exports = sequelize;

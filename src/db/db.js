// const mysql = require('mysql');
const orm = require('orm');
const config = require('../../config');

const db = orm.connect(config.db);

module.exports = db;

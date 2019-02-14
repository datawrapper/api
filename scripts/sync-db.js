#!/usr/bin/env node
/* eslint-env node */
/* eslint no-console: "off" */
const chalk = require('chalk');
const ORM = require('@datawrapper/orm');
const config = require('../src/config');

ORM.init(config);

// add missing tables without touching existing ones
require('@datawrapper/orm/models');
ORM.db
    .sync()
    .then(() => {
        console.log(chalk.green('database sync complete.\n'));
        ORM.db.close();
    })
    .catch(error => {
        console.error(error);
        ORM.db.close();
    });

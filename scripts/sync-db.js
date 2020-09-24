#! /usr/bin/env node
/* eslint no-console: "off" */
const chalk = require('chalk');
const ORM = require('@datawrapper/orm');
const { requireConfig } = require('@datawrapper/service-utils/findConfig');
const config = requireConfig();

ORM.init(config).then(() => {
    // add missing tables without touching existing ones
    require('@datawrapper/orm/models');
    ORM.db
        .sync()
        .then(() => {
            console.log(chalk.green('Database sync complete.\n'));
            ORM.db.close();
        })
        .catch(error => {
            console.error(error);
            ORM.db.close();
        });
});

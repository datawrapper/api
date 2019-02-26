/* eslint no-console: "off" */
const ORM = require('@datawrapper/orm');
const config = require('../config');

ORM.init(config);

// add missing tables without touching existing ones
require('@datawrapper/orm/models');
ORM.db
    .sync()
    .then(() => {
        console.log('🎉 Database sync complete.\n');
        ORM.db.close();
    })
    .catch(error => {
        console.error(error);
        ORM.db.close();
    });

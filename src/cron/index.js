const cron = require('node-cron');

// queue export jobs for recently edited charts every minute
cron.schedule('*/5 * * * * *', require('./queue-editor-screenshots'));
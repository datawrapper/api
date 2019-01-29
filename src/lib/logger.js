const winston = require('winston');
const { combine, colorize, printf, timestamp } = winston.format;

const myFormat = printf(info => {
    let s = `${info.timestamp} [${info.label || ''}${info.job ? '@' + info.job : ''}] ${
        info.level
    }: ${info.message}`;
    delete info.timestamp;
    delete info.label;
    delete info.job;
    delete info.level;
    delete info.message;
    if (Object.keys(info).length) s += ' ' + JSON.stringify(info);
    return s;
});

module.exports = winston.createLogger({
    transports: [new winston.transports.Console()],
    format: combine(colorize({ all: true }), timestamp(), myFormat)
});

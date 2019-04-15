const Joi = require('joi');
const chalk = require('chalk');

const schema = Joi.object()
    .keys({
        frontend: Joi.object()
            .keys({
                domain: Joi.string()
                    .hostname()
                    .required(),
                https: Joi.boolean()
            })
            .unknown()
            .required(),
        api: Joi.object()
            .keys({
                port: Joi.number()
                    .integer()
                    .default(3000),
                domain: Joi.string()
                    .hostname()
                    .required(),
                subdomain: Joi.string(),
                sessionID: Joi.string()
                    .required()
                    .default('DW-SESSION'),
                https: Joi.boolean(),
                cors: Joi.array().required(),
                hashRounds: Joi.number().integer(),
                enableMigration: Joi.boolean(),
                authSalt: Joi.string(),
                secretAuthSalt: Joi.string()
            })
            .required(),
        plugins: Joi.object(),
        orm: Joi.object()
            .keys({
                retry: Joi.boolean().optional(),
                db: Joi.object()
                    .keys({
                        dialect: Joi.string()
                            .required()
                            .default('mysql'),
                        host: Joi.string()
                            .hostname()
                            .required(),
                        port: Joi.number()
                            .integer()
                            .default(3306),
                        user: Joi.string().required(),
                        password: Joi.string().required(),
                        database: Joi.string().required()
                    })
                    .required()
            })
            .required()
    })
    .unknown();

function validate(config) {
    const { error, value } = Joi.validate(config, schema, { abortEarly: false });

    if (error) {
        process.stderr.write(chalk.red(`\nserver config validation failed\n`));
        error.details.forEach(err => {
            process.stderr.write(
                `    [${err.path.join('.')}] ${err.message} | value: ${err.context.value}\n`
            );
        });
        process.exit(1);
    }

    return value;
}

module.exports = { schema, validate };

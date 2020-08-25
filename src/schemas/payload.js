const Joi = require('@hapi/joi');

const schemas = {};

schemas.createUserPayload = [
    // normal sign-up
    Joi.object({
        name: Joi.string()
            .allow(null)
            .example('Carol Danvers')
            .description('Name of the user that should get created. This can be omitted.'),
        email: Joi.string()
            .email()
            .required()
            .example('cpt-marvel@shield.com')
            .description('User email address'),
        role: Joi.string().valid('editor', 'admin').description('User role. This can be omitted.'),
        language: Joi.string()
            .example('en_US')
            .description('User language preference. This can be omitted.'),
        password: Joi.string()
            .example('13-binary-1968')
            .min(8)
            .required()
            .description('Strong user password.'),
        invitation: Joi.boolean().valid(false).allow(null)
    }),
    // for invitation sign-ups
    Joi.object({
        email: Joi.string()
            .email()
            .required()
            .example('cpt-marvel@shield.com')
            .description('User email address'),
        invitation: Joi.boolean().valid(true).required(),
        chartId: Joi.string().optional(),
        role: Joi.string().valid('editor', 'admin').description('User role. This can be omitted.')
    })
];

module.exports = schemas;

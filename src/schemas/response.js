const Joi = require('@hapi/joi');

function createResponseConfig(schema) {
    return {
        sample: process.env.NODE_ENV === 'development' ? 100 : 0,
        ...schema
    };
}

const schemas = { createResponseConfig };

schemas.listResponse = createResponseConfig({
    schema: Joi.object({
        list: Joi.array().items(Joi.object()),
        total: Joi.number().integer(),
        next: Joi.string().optional()
    }).unknown()
});

schemas.noContentResponse = createResponseConfig({
    status: { '204': Joi.any().empty() }
});

module.exports = schemas;

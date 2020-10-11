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
    status: { 204: Joi.any().empty() }
});

schemas.chartResponse = createResponseConfig({
    schema: Joi.object({
        id: Joi.string(),
        title: Joi.string(),
        metadata: Joi.object()
    }).unknown()
});

schemas.teamResponse = createResponseConfig({
    schema: Joi.object({
        id: Joi.string(),
        name: Joi.string()
    }).unknown()
});

schemas.userResponse = createResponseConfig({
    schema: Joi.object({
        id: Joi.number().integer(),
        email: Joi.string()
    }).unknown()
});

module.exports = schemas;

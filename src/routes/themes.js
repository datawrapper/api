const Joi = require('@hapi/joi');
const assign = require('assign-deep');
const { camelizeKeys } = require('humps');
const { Theme } = require('@datawrapper/orm/models');

module.exports = {
    name: 'themes-routes',
    version: '1.0.0',
    register: (server, options) => {
        server.route({
            method: 'GET',
            path: '/{id}',
            options: {
                tags: ['api'],
                validate: {
                    params: {
                        id: Joi.string().required()
                    },
                    query: {
                        extend: Joi.boolean().default(false)
                    }
                }
            },
            handler: getTheme
        });
    }
};

async function getTheme(request, h) {
    const { params, query, url } = request;

    let originalExtend;
    let dataValues = { extend: params.id, data: {} };

    while (dataValues.extend) {
        const extendedTheme = await Theme.findByPk(dataValues.extend);

        if (!originalExtend) {
            originalExtend = extendedTheme.extend;
        }

        if (!dataValues.id) {
            dataValues = extendedTheme.dataValues;
        }

        extendedTheme.data = JSON.parse(extendedTheme.data);
        extendedTheme.assets = JSON.parse(extendedTheme.assets);

        if (extendedTheme.less !== dataValues.less) {
            dataValues.less = `${extendedTheme.less}
${dataValues.less}
`;
        }

        dataValues.data = assign(extendedTheme.data, dataValues.data);
        dataValues.assets = { ...extendedTheme.assets, ...dataValues.assets };
        dataValues.extend = extendedTheme.extend;

        if (!query.extend) break;
    }

    dataValues.extend = originalExtend;
    dataValues.url = url.pathname;

    return camelizeKeys(dataValues);
}

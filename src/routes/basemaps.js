const got = require('got');
const Joi = require('@hapi/joi');

module.exports = {
    name: 'basemaps-routes',
    version: '1.0.0',
    register: (server, options) => {
        server.route({
            method: 'GET',
            path: '/{chartId}/{id}',
            options: {
                tags: ['api'],
                validate: {
                    params: Joi.object().keys({
                        id: Joi.string()
                            .required()
                            .description('Basemap ID.'),
                        chartId: Joi.string()
                    })
                }
            },
            handler: getBasemap
        });
    }
};

async function getBasemap(request, h) {
    const { params, server } = request;
    const { api } = server.methods.config();

    const { data } = await got(`plugin/basemaps/${params.id}`, {
        method: 'GET',
        headers: {
            cookie: request.headers.cookie,
            authorization: request.headers.authorization
        },
        prefixUrl: `${api.https ? 'https' : 'http'}://${api.domain}`
    }).json();

    data.content = JSON.parse(data.content);
    return data;
}

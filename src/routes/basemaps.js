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

    const { data } = await got(`plugin/simple-maps/${params.chartId}/basemap`, {
        method: 'PUT',
        headers: {
            cookie: request.headers.cookie,
            authorization: request.headers.authorization
        },
        body: JSON.stringify({ basemap: params.id }),
        prefixUrl: `${api.https ? 'https' : 'http'}://${api.domain}`
    }).json();

    data.content = JSON.parse(data.meta.topojson);
    data.meta.topojson = undefined;

    return data;
}

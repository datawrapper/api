const Joi = require('joi');
const { Op } = require('sequelize');
const { camelizeKeys } = require('humps');
const set = require('lodash/set');
const { Chart } = require('@datawrapper/orm/models');

module.exports = {
    name: 'chart-routes',
    version: '1.0.0',
    register: (server, options) => {
        server.route({
            method: 'GET',
            path: '/',
            config: {
                tags: ['api'],
                validate: {
                    query: Joi.object().keys({
                        metadataFormat: Joi.string()
                            .valid(['json', 'string'])
                            .default('json'),
                        userId: Joi.any()
                    })
                }
            },
            handler: getAllCharts
        });
    }
};

async function getAllCharts(request, h) {
    const { query, url } = request;

    let options = {
        attributes: [
            'id',
            'title',
            'type',
            'metadata',
            'created_at',
            'last_modified_at',
            'author_id'
        ]
    };

    if (query.userId === 'me') {
        set(options, ['where', 'author_id'], request.auth.artifacts.id);
    } else {
        set(options, ['where', 'published_at', Op.ne], null);
    }

    const { count, rows } = await Chart.findAndCountAll(options);

    const charts = rows.map(chart => {
        chart = camelizeKeys(chart.dataValues);
        if (query.metadataFormat === 'json' && typeof chart.metadata === 'string') {
            chart.metadata = JSON.parse(chart.metadata);
        }

        if (query.metadataFormat === 'string' && typeof chart.metadata === 'object') {
            chart.metadata = JSON.stringify(chart.metadata);
        }

        return {
            ...chart,
            url: `${url.origin}${url.pathname}/${chart.id}`
        };
    });

    return {
        list: charts,
        total: count
    };
}

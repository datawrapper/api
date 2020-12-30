const path = require('path');
const mime = require('mime');
const Joi = require('@hapi/joi');
const Boom = require('@hapi/boom');
const { noContentResponse } = require('../../../schemas/response');
const { ChartAccessToken } = require('@datawrapper/orm/models');

module.exports = (server, options) => {
    // GET /v3/charts/{id}/assets/{asset}
    server.route({
        method: 'GET',
        path: '/assets/{asset}',
        options: {
            tags: ['api'],
            description: 'Fetch chart asset',
            auth: {
                access: { scope: ['chart:read'] }
            },
            notes: `Request an asset associated with a chart. Requires scope \`chart:read\`.`,
            plugins: {
                'hapi-swagger': {
                    produces: ['text/csv', 'application/json']
                }
            },
            validate: {
                params: Joi.object({
                    id: Joi.string().length(5).required(),
                    asset: Joi.string().required().description('Full filename including extension.')
                })
            }
        },
        handler: getChartAsset
    });

    // PUT /v3/charts/{id}/assets/{asset}
    server.route({
        method: 'PUT',
        path: '/assets/{asset}',
        options: {
            tags: ['api'],
            description: 'Upload chart data',
            notes: `Upload data for a chart, which is usually a CSV.
                        An example looks like this: \`/v3/charts/{id}/assets/{id}.csv\`. Requires scope \`chart:write\`.`,
            auth: {
                access: { scope: ['chart:write'] }
            },
            plugins: {
                'hapi-swagger': {
                    consumes: ['text/csv', 'application/json']
                }
            },
            validate: {
                params: Joi.object({
                    id: Joi.string().length(5).required(),
                    asset: Joi.string().required().description('Full filename including extension.')
                }),
                payload: [
                    Joi.string().description(
                        'An asset used by the chart such as CSV data or custom JSON map.'
                    ),
                    Joi.object()
                ]
            },
            response: noContentResponse,
            payload: {
                maxBytes: 2048 * 1024, // 2MiB
                defaultContentType: 'text/csv',
                allow: ['text/csv', 'application/json']
            }
        },
        handler: writeChartAsset
    });
};

async function getChartAsset(request, h) {
    const { params, auth, query, server } = request;
    const { events, event } = server.app;
    const chart = await server.methods.loadChart(request.params.id);

    const filename = params.asset;

    let isEditable = await chart.isEditableBy(request.auth.artifacts, auth.credentials.session);

    if (!isEditable && query.ott) {
        // we do not destroy the access token here, because this request might
        // have been internally injected from the /chart/:id/publish/data endpoint
        const count = await ChartAccessToken.count({
            where: {
                chart_id: params.id,
                token: query.ott
            },
            limit: 1
        });

        if (count === 1) {
            isEditable = true;
        }
    }

    if (filename !== `${chart.id}.public.csv` && !isEditable) {
        return Boom.forbidden();
    }

    if (!getAssetWhitelist(params.id).includes(params.asset)) {
        return Boom.badRequest();
    }

    try {
        const contentStream = await events.emit(
            event.GET_CHART_ASSET,
            { chart, filename },
            { filter: 'first' }
        );

        const contentType =
            chart.type === 'locator-map' && path.extname(filename) === '.csv'
                ? 'application/json'
                : mime.getType(filename);

        return h
            .response(contentStream)
            .header('Content-Type', contentType)
            .header('Content-Disposition', `attachment; filename=${filename}`);
    } catch (error) {
        if (error.name === 'CodedError' && Boom[error.code]) {
            // this seems to be an orderly error
            return Boom[error.code](error.message);
        }
        request.logger.error(error.message);
        return Boom.badImplementation();
    }
}

function getAssetWhitelist(id) {
    return [
        '{id}.csv',
        '{id}.public.csv',
        '{id}.map.json',
        '{id}.minimap.json',
        '{id}.highlight.json'
    ].map(name => name.replace('{id}', id));
}

async function writeChartAsset(request, h) {
    const { params, auth, server } = request;
    const { events, event } = server.app;
    const user = auth.artifacts;
    const chart = await server.methods.loadChart(request.params.id);

    const isEditable = await chart.isEditableBy(request.auth.artifacts, auth.credentials.session);

    if (!isEditable) {
        return Boom.forbidden();
    }

    if (!getAssetWhitelist(params.id).includes(params.asset)) {
        return Boom.badRequest();
    }

    const filename = params.asset;

    try {
        const { code } = await events.emit(
            event.PUT_CHART_ASSET,
            {
                chart,
                data:
                    request.headers['content-type'] === 'application/json'
                        ? JSON.stringify(request.payload)
                        : request.payload,
                filename
            },
            { filter: 'first' }
        );

        // log chart/edit
        await request.server.methods.logAction(user.id, `chart/edit`, chart.id);

        return h.response().code(code);
    } catch (error) {
        request.logger.error(error.message);
        return Boom.notFound();
    }
}

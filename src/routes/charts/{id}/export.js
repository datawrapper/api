const Joi = require('@hapi/joi');
const Boom = require('@hapi/boom');
const { Chart } = require('@datawrapper/orm/models');
const { Op } = require('@datawrapper/orm').db;

module.exports = (server, options) => {
    // POST /v3/charts/{id}/export/{format}
    server.route({
        method: 'POST',
        path: '/export/{format}',
        options: {
            validate: {
                params: Joi.object({
                    id: Joi.string()
                        .length(5)
                        .required()
                        .description('5 character long chart ID.'),
                    format: Joi.string()
                        .required()
                        .valid(...server.app.exportFormats.values())
                        .description('Export format')
                }),
                payload: Joi.object({
                    unit: Joi.string().default('px'),
                    mode: Joi.string().default('rgb'),
                    width: Joi.number().default(600),
                    height: Joi.number()
                        .min(1)
                        .allow('auto'),
                    plain: Joi.boolean().default(false),
                    scale: Joi.number().default(1),
                    zoom: Joi.number().default(2),
                    border: Joi.object().keys({
                        width: Joi.number(),
                        color: Joi.string().default('auto')
                    }),
                    fullVector: Joi.boolean().default(false)
                })
            }
        },
        handler: exportChart
    });

    // GET /v3/charts/{id}/export/{format}
    server.route({
        method: 'GET',
        path: '/export/{format}',
        options: {
            tags: ['api'],
            description: 'Export chart',
            notes: `Export your chart as image or document for use in print or presentations.
                        Not all formats might be available to you, based on your account.`,
            plugins: {
                'hapi-swagger': {
                    produces: ['image/png', 'image/svg+xml', 'application/pdf']
                }
            },
            validate: {
                params: Joi.object({
                    id: Joi.string()
                        .length(5)
                        .required()
                        .description('5 character long chart ID.'),
                    format: Joi.string()
                        .required()
                        .valid(...server.app.exportFormats.values())
                        .description('Export format')
                }),
                query: Joi.object({
                    unit: Joi.string().default('px'),
                    mode: Joi.string()
                        .valid('rgb', 'cmyk')
                        .default('rgb'),
                    width: Joi.number()
                        .default(600)
                        .min(1)
                        .optional(),
                    height: Joi.number()
                        .min(1)
                        .allow('auto'),
                    plain: Joi.boolean().default(false),
                    scale: Joi.number().default(1),
                    zoom: Joi.number().default(2),
                    borderWidth: Joi.number(),
                    borderColor: Joi.string(),
                    download: Joi.boolean().default(false),
                    fullVector: Joi.boolean().default(false)
                })
            }
        },
        handler: handleChartExport
    });
};

async function exportChart(request, h) {
    const { query, payload, params, auth, logger, server } = request;
    const { events, event } = server.app;
    const user = auth.artifacts;

    // authorize user
    const chart = await Chart.findOne({
        where: {
            id: params.id,
            deleted: { [Op.not]: true }
        }
    });

    if (!chart) return Boom.notFound();
    const mayEdit = await user.mayEditChart(chart);
    if (!mayEdit) return Boom.notFound();

    // user is authorized to access chart
    // further authoritzation is handled by plugins

    Object.assign(payload, params);
    try {
        const result = (
            await events.emit(event.CHART_EXPORT, {
                chart,
                user,
                data: payload,
                auth,
                logger
            })
        ).find(res => res.status === 'success' && res.data);

        if (!result) return Boom.badImplementation();

        await request.server.methods.logAction(user.id, `chart/export/${params.format}`, params.id);

        const { stream, type } = result.data;

        if (query.download || params.format === 'zip') {
            return h
                .response(stream)
                .header(
                    'Content-Disposition',
                    `attachment; filename="${params.id}.${params.format}"`
                );
        } else {
            return h.response(stream).header('Content-Type', type);
        }
    } catch (error) {
        if (error.name === 'CodedError' && Boom[error.code]) {
            // this seems to be an orderly error
            return Boom[error.code](error.message);
        }
        // this is an unexpected error, so let's log it
        request.logger.error(error);
        return Boom.badImplementation();
    }
}

async function handleChartExport(request, h) {
    const { borderWidth, borderColor, ...query } = request.query;
    let border;

    if (borderWidth || borderColor) {
        border = {
            width: borderWidth,
            color: borderColor
        };
    }

    request.payload = Object.assign(query, { border });
    return exportChart(request, h);
}

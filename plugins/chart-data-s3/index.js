const path = require('path');
const Boom = require('boom');
const Joi = require('joi');
const S3 = require('aws-sdk/clients/s3');

const s3 = new S3({ apiVersion: '2006-03-01' });

module.exports = {
    name: 'chart-data-s3',
    version: '1.0.0',
    register: (server, options) => {
        server.route({
            method: 'GET',
            path: '/charts/{id}/data',
            options: {
                tags: ['api', 'plugin'],
                validate: {
                    params: Joi.object().keys({
                        id: Joi.string()
                            .length(5)
                            .required()
                    })
                }
            },

            handler: getChartData
        });

        async function getChartData(request, h) {
            const { id } = request.params;
            const { Chart } = options.models;

            const chart = await Chart.findByPk(id, {
                attributes: ['author_id', 'created_at']
            });

            if (!chart) {
                return Boom.notFound();
            }

            if (chart.author_id !== request.auth.artifacts.id) {
                return Boom.unauthorized();
            }

            const data = await s3
                .getObject({
                    Bucket: options.config.bucket,
                    Key: path.join(options.config.path, getDataPath(id, chart.created_at))
                })
                .promise();

            return h
                .response(data.Body)
                .header('Content-Type', 'text/csv')
                .header('Content-Disposition', `attachment; filename=${id}.csv`);
        }

        server.route({
            method: 'PUT',
            path: '/charts/{id}/data',
            options: {
                tags: ['api', 'plugin'],
                validate: {
                    params: Joi.object().keys({
                        id: Joi.string()
                            .length(5)
                            .required()
                    }),
                    payload: Joi.string()
                }
            },
            handler: writeChartData
        });

        async function writeChartData(request, h) {
            const { id } = request.params;
            const { Chart } = options.models;

            const chart = await Chart.findByPk(id, {
                attributes: ['author_id', 'created_at']
            });

            if (!chart) {
                return Boom.notFound();
            }

            if (chart.author_id !== request.auth.artifacts.id) {
                return Boom.unauthorized();
            }

            let fileExists = false;

            try {
                await s3
                    .headObject({
                        Bucket: options.config.bucket,
                        Key: path.join(options.config.path, getDataPath(id, chart.created_at))
                    })
                    .promise();
                fileExists = true;
            } catch (error) {
                fileExists = false;
            }

            try {
                await s3
                    .putObject({
                        ACL: 'public-read',
                        Body: request.payload,
                        Bucket: options.config.bucket,
                        Key: path.join(options.config.path, getDataPath(id, chart.created_at)),
                        ContentType: 'text/csv'
                    })
                    .promise();
            } catch (error) {
                request.logger.error(error.message);
                return Boom.badGateway();
            }

            return h.response().code(fileExists ? 204 : 201);
        }
    }
};

function getDataPath(id, date) {
    const year = date.getUTCFullYear();
    const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
    return path.join(`${year}${month}`, `${id}.csv`);
}

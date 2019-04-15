const path = require('path');
const fs = require('fs');
const { promisify } = require('util');
const Boom = require('Boom');
const Joi = require('Joi');
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);
const stat = promisify(fs.stat);

module.exports = {
    name: 'chart-data-local',
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

            const dataPath = path.join(options.config.path, getDataPath(id, chart.created_at));

            try {
                const data = await readFile(dataPath, { encoding: 'utf-8' });

                return h
                    .response(data)
                    .header('Content-Type', 'text/csv')
                    .header('Content-Disposition', `attachment; filename=${id}.csv`);
            } catch (error) {
                request.logger.error(error.message);
                return Boom.notFound();
            }
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

            const dataPath = path.join(options.config.path, getDataPath(id, chart.created_at));

            let fileExists = false;
            try {
                const fileStats = await stat(dataPath);
                fileExists = fileStats.isFile(dataPath);
            } catch (error) {
                await mkdir(dataPath, { recursive: true });
            }

            try {
                await writeFile(dataPath, request.payload, {
                    encoding: 'utf-8'
                });
            } catch (error) {
                request.logger.error(error.message);
                return Boom.internal();
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

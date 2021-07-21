const fs = require('fs-extra');
const Boom = require('@hapi/boom');

module.exports = (server, options) => {
    server.route({
        method: 'GET',
        path: '/script.js',
        options: {
            auth: {
                mode: 'try',
                access: { scope: ['visualization:read'] }
            }
        },
        handler: getVisualizationScript
    });
};

async function getVisualizationScript(request, h) {
    const { params, server } = request;

    const { result, statusCode } = await server.inject({
        url: `/v3/visualizations/${params.id}`,
        validate: false
    });

    if (statusCode !== 200) {
        return new Boom.Boom(result.message, result);
    }

    const file = result.script;
    const { mtime } = await fs.stat(file);

    /* https://hapi.dev/api/?v=19.1.1#-hentityoptions */
    const response = h.entity({ modified: mtime });

    if (response) return response;

    const stream = fs.createReadStream(file, { encoding: 'utf-8' });
    return h.response(stream).header('Content-Type', 'application/javascript');
}

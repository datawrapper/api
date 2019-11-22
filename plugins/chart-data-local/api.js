const path = require('path');
const fs = require('fs');
const { promisify } = require('util');
const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);
const stat = promisify(fs.stat);

module.exports = {
    name: 'chart-data-local',
    version: '1.0.0',
    register: (server, options) => {
        const { events, event } = server.app;

        async function isFile(path) {
            try {
                const fileStats = await stat(path);
                return fileStats.isFile(path);
            } catch (error) {
                return false;
            }
        }

        events.on(event.GET_CHART_ASSET, async ({ chart, filename }) => {
            const filePath = path.join(
                options.config.data_path,
                getDataPath(chart.dataValues.created_at),
                filename
            );

            const fileExists = await isFile(filePath);

            if (!fileExists) {
                throw new Error('ASSET_NOT_FOUND');
            }

            const stream = fs.createReadStream(filePath, { encoding: 'utf-8' });
            return stream;
        });

        events.on(event.PUT_CHART_ASSET, async ({ chart, data, filename }) => {
            const dataPath = path.join(
                options.config.data_path,
                getDataPath(chart.dataValues.created_at)
            );
            const filePath = path.join(dataPath, filename);

            const fileExists = await isFile(filePath);
            if (!fileExists) {
                await mkdir(dataPath, { recursive: true });
            }

            await writeFile(filePath, data, {
                encoding: 'utf-8'
            });

            return { code: fileExists ? 204 : 201 };
        });
    }
};

function getDataPath(date) {
    const year = date.getUTCFullYear();
    const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
    return `${year}${month}`;
}

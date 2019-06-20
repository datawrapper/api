const path = require('path');
const fs = require('fs');
const { promisify } = require('util');
const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);
const mkdir = promisify(fs.mkdir);
const stat = promisify(fs.stat);

module.exports = {
    name: 'chart-data-local',
    version: '1.0.0',
    register: (server, options) => {
        const { events, event } = server.app;

        events.on(event.GET_CHART_DATA, async ({ chart, filename }) => {
            const filePath = path.join(
                options.config.path,
                getDataPath(chart.created_at),
                filename
            );

            const data = await readFile(filePath, { encoding: 'utf-8' });
            return data;
        });

        events.on(event.PUT_CHART_DATA, async ({ chart, data, filename }) => {
            const dataPath = path.join(options.config.path, getDataPath(chart.created_at));
            const filePath = path.join(dataPath, filename);

            let fileExists = false;
            try {
                const fileStats = await stat(filePath);
                fileExists = fileStats.isFile(filePath);
            } catch (error) {
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

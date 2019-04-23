const path = require('path');
const S3 = require('aws-sdk/clients/s3');

const s3 = new S3({ apiVersion: '2006-03-01' });

module.exports = {
    name: 'chart-data-s3',
    version: '1.0.0',
    register: (server, options) => {
        const { events, event } = server.app;

        events.on(event.GET_CHART_DATA, getChartData);
        events.on(event.PUT_CHART_DATA, writeChartData);

        async function getChartData(chart) {
            const data = await s3
                .getObject({
                    Bucket: options.config.bucket,
                    Key: path.join(options.config.path, getDataPath(chart.id, chart.created_at))
                })
                .promise();

            return data.Body;
        }

        async function writeChartData({ chart, data }) {
            let fileExists = false;

            try {
                await s3
                    .headObject({
                        Bucket: options.config.bucket,
                        Key: path.join(options.config.path, getDataPath(chart.id, chart.created_at))
                    })
                    .promise();
                fileExists = true;
            } catch (error) {
                fileExists = false;
            }

            await s3
                .putObject({
                    ACL: 'public-read',
                    Body: data,
                    Bucket: options.config.bucket,
                    Key: path.join(options.config.path, getDataPath(chart.id, chart.created_at)),
                    ContentType: 'text/csv'
                })
                .promise();

            return { code: fileExists ? 204 : 201 };
        }
    }
};

function getDataPath(id, date) {
    const year = date.getUTCFullYear();
    const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
    return path.join(`${year}${month}`, `${id}.csv`);
}

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

        async function getChartData({ chart, filename }) {
            const data = await s3
                .getObject({
                    Bucket: options.config.bucket,
                    Key: path.join(options.config.path, getDataPath(chart.created_at), filename)
                })
                .promise();

            return data.Body;
        }

        async function writeChartData({ chart, data, filename }) {
            let fileExists = false;
            const Key = path.join(options.config.path, getDataPath(chart.created_at), filename);

            try {
                await s3
                    .headObject({
                        Bucket: options.config.bucket,
                        Key
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
                    Key,
                    ContentType: 'text/csv'
                })
                .promise();

            return { code: fileExists ? 204 : 201 };
        }
    }
};

function getDataPath(date) {
    const year = date.getUTCFullYear();
    const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
    return `${year}${month}`;
}

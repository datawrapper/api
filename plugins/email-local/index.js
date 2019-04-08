const nodemailer = require('nodemailer');

module.exports = {
    name: 'local-email',
    version: '1.0.0',
    register: async (server, options) => {
        const account = await nodemailer.createTestAccount();

        let transporter = nodemailer.createTransport({
            host: account.smtp.host,
            port: account.smtp.port,
            secure: account.smtp.secure,
            auth: {
                user: account.user,
                pass: account.pass
            }
        });

        async function sendMail(type, data) {
            const info = await transporter.sendMail({
                from: 'dev@dw-api.de',
                to: 'user@dw-api.de',
                subject: 'This is a test',
                html: `
                <h1>${type}</h1>
                <pre>${JSON.stringify(data, null, 2)}</pre>`
            });
            const url = nodemailer.getTestMessageUrl(info);
            server.logger().debug({ url, ...data }, `[local-email] ${type}`);
            return url;
        }

        server.methods.registerMail(sendMail);
    }
};

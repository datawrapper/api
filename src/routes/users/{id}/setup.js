const Boom = require('@hapi/boom');
const Joi = require('@hapi/joi');
const { User } = require('@datawrapper/orm/models');

module.exports = (server, options) => {
    // POST /v3/users/{id}/setup
    server.route({
        method: 'POST',
        path: '/setup',
        options: {
            auth: {
                access: { scope: ['user', 'all'] }
            },
            validate: {
                params: Joi.object({
                    id: Joi.number()
                        .required()
                        .description('User ID')
                })
            }
        },
        handler: handleSetup
    });
};

async function handleSetup(request, h) {
    const { params, server } = request;
    const { generateToken, isAdmin, config } = server.methods;

    if (!isAdmin(request)) return Boom.unauthorized();

    const user = await User.findByPk(params.id, { attributes: ['id', 'email', 'language'] });

    if (!user) return Boom.notFound();

    const token = generateToken();

    await user.update({ pwd: '', activate_token: token });

    const { https, domain } = config('frontend');
    await server.app.events.emit(request.server.app.event.SEND_EMAIL, {
        type: 'user-setup',
        to: user.email,
        language: user.language,
        data: {
            email: user.email,
            invite_link: `${https ? 'https' : 'http'}://${domain}/account/invite/${token}`
        }
    });

    return { token };
}

const bcrypt = require('bcrypt');
const nanoid = require('nanoid');
const Boom = require('boom');
const { User, Session } = require('@datawrapper/orm/models');

async function login(request, h) {
    const user = await User.findOne({
        where: { email: request.payload.email },
        attributes: ['id', 'pwd']
    });

    if (!user) {
        return Boom.unauthorized('Invalid credentials');
    }

    const isValid = await bcrypt.compare(request.payload.password, user.pwd);
    if (!isValid) {
        return Boom.unauthorized('Invalid credentials');
    }

    const session = await Session.create({
        id: nanoid(),
        data: { 'dw-user-id': user.id }
    });

    return h
        .response({
            'DW-SESSION': session.id
        })
        .state('DW-SESSION', session.id);
}

async function logout(request, h) {
    const session = await Session.findByPk(request.state['DW-SESSION'], { attributes: ['id'] });
    await session.destroy();
    return h
        .response()
        .code(205)
        .unstate('DW-SESSION')
        .header('Clear-Site-Data', '"cookies", "storage", "executionContexts"');
}

module.exports = {
    login,
    logout
};

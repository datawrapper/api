import nanoid from 'nanoid';
import { Op } from 'sequelize';
import { init } from '../../src/server';

const passwordHash = '$2b$15$UdsGvrTLEk5DPRmRoHE4O..tzDpkWkAdKjBoKUjERXKoYHqTIRis6';
const credentials = {
    email: `test-${nanoid(5)}@ava.js`,
    password: 'test-password'
};

export async function setup(options) {
    const server = await init(options);
    const models = require('@datawrapper/orm/models');

    async function getUser() {
        let user = await models.User.create({
            email: credentials.email,
            pwd: passwordHash,
            role: 'editor'
        });

        let session = await models.Session.create({
            id: server.methods.generateToken(),
            data: {
                'dw-user-id': user.id,
                persistent: true,
                last_action_time: Math.floor(Date.now() / 1000)
            }
        });

        async function cleanup() {
            await models.Chart.destroy({ where: { author_id: user.id } });
            await models.Session.destroy({
                where: {
                    data: {
                        [Op.like]: `dw-user-id|i:${user.id}%`
                    }
                }
            });
            await user.destroy();
        }

        return { user, session, cleanup };
    }

    return { server, models, getUser };
}

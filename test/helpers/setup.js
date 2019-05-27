import nanoid from 'nanoid';
import { Op } from 'sequelize';
import { init } from '../../src/server';

const passwordHash = '$2b$15$UdsGvrTLEk5DPRmRoHE4O..tzDpkWkAdKjBoKUjERXKoYHqTIRis6';

function getCredentials() {
    return {
        email: `test-${nanoid(5)}@ava.de`,
        password: 'test-password'
    };
}

export async function setup(options) {
    const server = await init(options);
    const models = require('@datawrapper/orm/models');

    async function getUser() {
        let user = await models.User.create({
            email: getCredentials().email,
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
            await models.UserTeam.destroy({ where: { user_id: user.id } });
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

    async function getTeamWithUser(role = 'owner') {
        const teamPromise = models.Team.create({
            id: `test-${nanoid(5)}`,
            name: 'Test Team'
        });

        const [team, userData] = await Promise.all([teamPromise, getUser()]);
        const { user, session, cleanup: userCleanup } = userData;

        await models.UserTeam.create({
            user_id: user.id,
            organization_id: team.id,
            team_role: role
        });

        let usersToCleanup = [];
        async function addUser(role = 'owner') {
            const user = await getUser();

            await models.UserTeam.create({
                user_id: user.user.id,
                organization_id: team.id,
                team_role: role
            });
            usersToCleanup.push(user.cleanup);
            return user;
        }

        async function cleanup() {
            await models.UserTeam.destroy({ where: { organization_id: team.id } });
            await team.destroy();
            await userCleanup();
            await Promise.all(usersToCleanup.map(f => f()));
        }

        return { team, user, session, cleanup, userCleanup, addUser };
    }

    return { server, models, getUser, getTeamWithUser };
}

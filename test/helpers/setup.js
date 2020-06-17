const fs = require('fs');
const os = require('os');
const { promisify } = require('util');
const path = require('path');
const nanoid = require('nanoid');
const { init } = require('../../src/server');

const appendFile = promisify(fs.appendFile);

const cleanupFile = path.join(os.tmpdir(), 'cleanup.csv');

/* bcrypt hash for string "test-password" */
const PASSWORD_HASH = '$2a$05$6B584QgS5SOXi1m.jM/H9eV.2tCaqNc5atHnWfYlFe5riXVW9z7ja';

function getCredentials() {
    return {
        email: `test-${nanoid(5)}@ava.de`,
        password: 'test-password'
    };
}

async function setup(options) {
    const server = await init(options);
    const models = require('@datawrapper/orm/models');

    async function addToCleanup(name, id) {
        await appendFile(cleanupFile, `${name};${id}\n`, { encoding: 'utf-8' });
    }

    async function getUser(role = 'editor', pwd = PASSWORD_HASH) {
        const credentials = getCredentials();
        const user = await models.User.create({
            name: `name-${credentials.email.split('@').shift()}`,
            email: credentials.email,
            pwd,
            role
        });

        const session = await models.Session.create({
            id: server.methods.generateToken(),
            data: {
                'dw-user-id': user.id,
                persistent: true,
                last_action_time: Math.floor(Date.now() / 1000)
            }
        });

        const { token } = await models.AccessToken.newToken({
            user_id: user.id,
            type: 'api-token',
            data: {
                comment: 'API TEST',
                scopes: ['all']
            }
        });

        await Promise.all([
            addToCleanup('token', token),
            addToCleanup('session', session.id),
            addToCleanup('user', user.id)
        ]);

        session.scope = ['all'];

        return {
            user,
            session,
            token
        };
    }

    async function getTeamWithUser(role = 'owner') {
        const teamPromise = models.Team.create({
            id: `test-${nanoid(5)}`,
            name: 'Test Team'
        });

        const [team, userData] = await Promise.all([teamPromise, getUser()]);
        const { user, session } = userData;

        await models.UserTeam.create({
            user_id: user.id,
            organization_id: team.id,
            team_role: role
        });

        const usersToCleanup = [];
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

        const data = `team;${team.id}\n`;

        await appendFile(cleanupFile, data, { encoding: 'utf-8' });

        return { team, user, session, addUser };
    }

    async function createTheme(themeData) {
        const theme = await models.Theme.findOrCreate({
            where: { id: themeData.id },
            defaults: themeData
        });

        await addToCleanup('theme', themeData.id);
        return theme;
    }

    return { server, models, getUser, getTeamWithUser, addToCleanup, createTheme, getCredentials };
}

module.exports = { setup };

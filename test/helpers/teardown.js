const path = require('path');
const os = require('os');
const fs = require('fs');
const chalk = require('chalk');
const ORM = require('@datawrapper/orm');

const log = str => process.stdout.write(str + '\n');
const cleanupFile = path.join(os.tmpdir(), 'cleanup.csv');

const configPath = [path.join(process.cwd(), 'config.js'), '/etc/datawrapper/config.js'].reduce(
    (path, test) => path || (fs.existsSync(test) ? test : undefined),
    ''
);
const config = require(configPath);

async function main() {
    await ORM.init(config);

    const models = require('@datawrapper/orm/models');
    const { Op } = ORM.db;

    let csv;
    try {
        csv = fs.readFileSync(cleanupFile, { encoding: 'utf-8' });
    } catch (error) {
        log('Nothing to clean up.');
        process.exit(0);
    }

    const list = {
        team: [],
        session: [],
        user: [],
        theme: []
    };

    csv.split('\n').forEach(line => {
        const row = line.split(';');
        if (list[row[0]]) {
            list[row[0]].push(row[1]);
        }
    });

    const [, , sessions, themes] = await Promise.all([
        models.Chart.destroy({ where: { author_id: { [Op.in]: list.user } } }),
        models.UserTeam.destroy({ where: { organization_id: { [Op.in]: list.team } } }),
        models.Session.destroy({ where: { session_id: { [Op.in]: list.session } } }),
        models.Theme.destroy({ where: { id: { [Op.in]: list.theme } } })
    ]);

    log(chalk.magenta(`🧹 Cleaned ${sessions} sessions`));
    log(chalk.magenta(`🧹 Cleaned ${themes} themes`));

    const teams = await models.Team.destroy({ where: { id: { [Op.in]: list.team } } });
    log(chalk.magenta(`🧹 Cleaned ${teams} teams`));

    const users = await models.User.destroy({ where: { id: { [Op.in]: list.user } } });
    log(chalk.magenta(`🧹 Cleaned ${users} users`));

    fs.unlinkSync(cleanupFile);
    process.exit(0);
}

try {
    main();
} catch (error) {
    log(error);
    process.exit(1);
}

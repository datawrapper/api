const chalk = require('chalk');
const arg = require('arg');
const Redis = require('ioredis');
const { requireConfig } = require('@datawrapper/service-utils/findConfig');

const config = requireConfig();

const redis = new Redis(config.redis);

let args = {};
try {
    args = arg(
        {
            '--help': Boolean
        },
        { permissive: true }
    );
} catch (error) {
    process.stderr.write(error.message);
    process.stderr.write('');
    process.exit(1);
}

if (args['--help']) {
    process.stdout.write(chalk`
  {bold.underline drop-vis-cache}

  {bold Script to delete cached visualization styles from Redis.}

  - Delete cached visualization styles
  node scripts/drop-vis-cache.js {underline d3-lines} {underline d3-pies}

`);

    process.exit(0);
}

const visualizations = args._;

const keysToDrop = [];

const stream = redis.scanStream({
    match: `*:vis-styles:*__*`
});

process.stdout.write(chalk`
{blue Scanning keys...}`);

stream.on('data', keys => {
    const filteredKeys = keys.filter(key => {
        key = key.split('__')[1];
        return visualizations.includes(key);
    });

    keysToDrop.push(...filteredKeys);
});

stream.on('end', async () => {
    process.stdout.write(chalk`
  {grey ${keysToDrop.join('\n  ')}}
{blue Found ${keysToDrop.length} ${keysToDrop.length === 1 ? 'key' : 'keys'} to delete}
`);

    let delCount = 0;
    if (keysToDrop.length) {
        delCount = await redis.del(...keysToDrop);
        process.stdout.write(
            chalk.green(`Deleted ${delCount} ${delCount === 1 ? 'key' : 'keys'}\n\n`)
        );
    }

    process.exit(0);
});

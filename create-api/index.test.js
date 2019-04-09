import test from 'ava';
import path from 'path';
import fs from 'fs';
import { exec, cd, tempdir, mkdir, rm, ls } from 'shelljs';

const dir = process.env.CI ? process.env.PWD : tempdir();
const testDir = path.resolve(dir, 'api-test');

const configJS = `
module.exports = {
  plugins: {
      '@datawrapper/plugin-random-data': {
        version: 'next'
      }
  }
};
`;

test.before(t => {
    mkdir(testDir);
    t.log('Created', testDir);
    cd(testDir);
    fs.writeFileSync(path.join(testDir, 'config.js'), configJS, { encoding: 'utf-8' });
});

test.after.always(t => {
    rm('-r', testDir);
    t.log('Removed', testDir);
});

test('should run create-api script', t => {
    exec(`INIT_CWD=${testDir} node ${__dirname} --tag=next`, { silent: true });
    const pkg = require(path.join(testDir, 'package.json'));
    const dwPackages = ls(path.join(testDir, 'node_modules/@datawrapper'));

    t.log(pkg);
    t.log(ls(ls(path.join(testDir, 'node_modules'))).stdout);

    t.truthy(pkg.scripts['api']);
    t.truthy(pkg.scripts['sync']);
    t.truthy(pkg.dependencies['@datawrapper/api']);
    t.truthy(pkg.dependencies['@datawrapper/plugin-random-data']);
    t.true(dwPackages.includes('api'));
    t.true(dwPackages.includes('plugin-random-data'));
});

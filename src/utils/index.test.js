const test = require('ava');
const fs = require('fs-extra');
const { nanoid } = require('nanoid');
const path = require('path');
const os = require('os');
const utils = require('./index.js');

test.before(async t => {
    const directory = path.join(os.tmpdir(), 'dw.api.test');
    await fs.mkdir(directory);

    Object.assign(t.context, { directory });
});

test.after.always(async t => {
    await fs.remove(t.context.directory);
});

test('stringify escapes <script> and <style> tags', t => {
    const result = utils.stringify({
        test: '<script>alert("test")</script><style>body {}</style>'
    });

    t.true(result.includes('<\\/script>'));
    t.true(result.includes('<\\/style>'));
});

test('copyFileHashed should copy a file with hashed filename', async t => {
    const directory = path.join(t.context.directory, nanoid());
    const data = 'TEST';
    const dataHash = '94ee0593';

    await fs.mkdir(directory);
    await fs.writeFile(path.join(directory, 'test.txt'), data, { encoding: 'utf-8' });

    const filename = await utils.copyFileHashed(path.join(directory, 'test.txt'), directory, {
        prefix: 'foo'
    });
    const hash = filename.split('.').slice(-2, -1)[0];
    t.is(hash, dataHash);

    const content = await fs.readFile(path.join(directory, filename), { encoding: 'utf-8' });
    t.is(content, data);
});

test('readFileAndHash should create a filename with hash based on content', async t => {
    const directory = path.join(t.context.directory, nanoid());
    const data = 'TEST';
    const dataHash = '94ee0593';

    await fs.mkdir(directory);
    await fs.writeFile(path.join(directory, 'test.txt'), data, { encoding: 'utf-8' });

    const { content, fileName } = await utils.readFileAndHash(path.join(directory, 'test.txt'));
    t.is(content, data);
    t.is(fileName, `test.${dataHash}.txt`);
});

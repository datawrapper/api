const fs = require('fs');
const path = require('path');

const CWD = process.env.INIT_CWD || process.cwd();

const pkgPath = path.join(CWD, 'package.json');
const pkg = require(pkgPath);

pkg.scripts['start'] = 'dw-api';
pkg.scripts['sync'] = 'dw-sync';

fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 4), { encoding: 'utf-8' });

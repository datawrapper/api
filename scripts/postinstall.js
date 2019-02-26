const fs = require('fs');
const path = require('path');

const pkgPath = path.join(process.cwd(), 'package.json');
const pkg = require(pkgPath);

pkg.scripts['start'] = 'dw-api';
pkg.scripts['sync'] = 'dw-sync';

fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 4), { encoding: 'utf-8' });

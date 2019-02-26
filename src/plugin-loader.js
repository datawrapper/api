/*
/src/plugins/{name}/index.js (file)

@datawrapper/plugin-* | dw-plugin-* (npm)
  /api
    - index.js -> HAPI plugin
  /frontend
  /whatever
*/
const path = require('path');
const globby = require('globby');

async function loadPlugins() {
    const paths = await globby('plugins/**/index.js');
    return paths.map(p => require(path.join(process.cwd(), p)));
}

module.exports = {
    name: 'plugin-loader',
    version: '1.0.0',
    register: async (server, options) => {
        const plugins = await loadPlugins();

        if (plugins.length) {
            await server.register(plugins);
        }
    }
};

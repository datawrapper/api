# @datawrapper/api

This repository contains the Node.js API. It is used to build datawrapper.de, automations and other integrations.
To learn more about, how to use it, go to https://developer.datawrapper.de/docs.

## Table of contents

1. [Installation](#installation)
1. [Local Development](#local-development)
1. [Configuration](#configuration)
1. [Server Methods](#server-methods)
1. [Server Application Data](#server-application-data)
1. [Plugins](#plugins)
    1. [Plugin Development](#plugin-development)
    1. [Updating a Plugin](#updating-a-plugin)

## Installation

To run a production instance of this API, clone the repository from Github. In it's essence, the following 3 commands are the setup. To get a more in depth look, read the sections about [configuration](#configuration) and [plugins](#plugins). That is the real strength of the API.

```sh
# Clone repository
> git clone git@github.com:datawrapper/api.git
```

You can start the server using:

```sh
npm run api
```

To check that the server won't crash on startup (faulty config or missing plugin) run:

```sh
npm run api -- --check
// or
node src/index.js --check
```

It is recommended to use the start script with a service manager like [PM2](https://pm2.io/runtime/) or `systemd` to guarantee best availability. They will also restart the API in case something crashes.

To make sure the database is in sync after ORM updates, run:

```sh
npm run sync
```

## Local Development

To develop new features or add some documentation, clone the repository and get going.

```sh
> git clone git@github.com:datawrapper/api.git dw-api

> cd dw-api

> npm install

> cp config.tpl.js config.js

# edit config.js and enter local database location and user credentials
> npm run dev
```

After running these commands you will see something like this:

```sh
❯ npm run dev

> @datawrapper/api@<version> dev /Users/fabian/code/api
> NODE_ENV=development nodemon src/index.js

[nodemon] 1.18.10
[nodemon] to restart at any time, enter `rs`
[nodemon] watching: *.*
[nodemon] starting `node src/index.js`
["2019-04-08T10:50:54.159Z"] INFO  (<version>): [Initialize] config.js
    file: "/<path>/api/config.js"
    config: {
      "frontend": { ... },
      "api": { ... },
      "orm": {
        "db": { ... }
      }
    }
["2019-04-08T10:50:54.729Z"] INFO  (<version>): server started
    created: 1554720654120
    started: 1554720654724
    host: "<host>"
    port: 3000
    protocol: "http"
    id: "<id>"
    uri: "<uri>"
    address: "127.0.0.1"
```

## Configuration

The API will not start without a valid `config.js`. The repository includes a template `config.tpl.js` that can be used to create the configuration file. `config.js` can either be located next to `config.tpl.js` or in `/etc/datawrapper/config.js`.

`config.js` exports a javascript object with various configuration objects that are used by this project, as well as others, like the `render-client` or `render-server`.
The following objects are used by the API.

Documentation about schemas and available keys can be found in [`datawrapper/schemas`](https://github.com/datawrapper/schemas).

## Server Methods

Server methods are a way to provide common utilities throughout the API server. Everywhere you have access to the `server` object (like in request handlers) these methods are available. ([hapi documentation](https://hapi.dev/api/?v=19.1.1#-servermethods))

-   `server.methods.config`
    Provides access to the servers `config.js` properties like `api` or `orm`.
-   `server.methods.comparePassword`
    Check validity of a password against a password hash.
-   `server.methods.createChartWebsite`
    Used by publish route and zip export to create a folder with all assets for a standalone Datawrapper chart.
-   `server.methods.generateToken`
    Generates a unique token/ID with a specified length.
-   `server.methods.getModel`
    Provides access to all registered ORM models (useful for quick access in plugins).
-   `server.methods.hashPassword`
    Hashes a cleartext password with the [`bcrypt`](https://en.wikipedia.org/wiki/Bcrypt) algorithm.
-   `server.methods.isAdmin`
    Checks if a request was initiated by a Datawrapper admin.
-   `server.methods.logAction`
    Logs an action to the `action` database table.
-   `server.methods.registerVisualization`
    Registers a new visualization type usually handled by plugins like `plugin-d3-lines`.
-   `server.methods.validateThemeData`
    Validate a theme against a schema.

## Server Application Data

Server application data is server specific data that can be accessed everywhere the `server` object is available. ([hapi documentation](https://hapi.dev/api/?v=19.1.1#-serverapp))

-   `server.app.event`
    List of events the server can emit.
-   `server.app.events`
    Event emitter to trigger server events.
-   `server.app.visualizations`
    A map of registered visualizations like `d3-lines`.
-   `server.app.exportFormats`
    A set of export formats the server can process (eg. PDF, png, zip)

## Plugins

The API is extensible to match customers and Datawrappers needs. By default the API has endpoints for basic functionality like user and chart management. This functionality can be extended with the use of plugins. Since the API is built on top of the [Hapi](https://hapijs.com) server framework, it uses [Hapis plugin system](https://hapijs.com/api#plugins). Everything a Hapi plugin can do, an API plugin can, too.

When starting the API server, it will check which plugins are configured in `config.js` and pass the configuration objects to the plugins `register` function with `options.config`. Plugins will have access to ORM models through `options.models`.

### Plugin Development

In its simplest form, an API plugin is a node module that exports an object with `name`, `version` and `register` keys.

```js
/* config.js */

plugins: {
    'my-plugin': {
        apiKey: 'agamotto'
    }
}

/* api.cjs */
module.exports = {
    name: 'my-plugin',
    version: '1.0.0',
    register: (server, options) => {
        console.log('hello from my-plugin!')
        console.log(`the api key is "${options.config.apiKey}"`)
        // -> the api key is "agamotto"
    }
}
```

You can use the [`hapijs` plugin options](https://hapi.dev/api/?v=19.1.1#-await-serverregisterplugins-options) to prefix all routes defined in your plugin (to avoid repeating the prefix again and again):

```js
/* api.cjs */
module.exports = {
    name: 'my-plugin',
    version: '1.0.0',
    options: {
        routes: {
            prefix: '/plugins/my-plugin'
        }
    },
    register: (server, options) => {
        server.route({
            method: 'GET',
            path: '/hello', // Route will be `/v3/plugins/my-plugin/hello`
            config: { auth: false, tags: ['api', 'plugin'] },
            handler: (request, h) => {
                return { data: 'Hello from plugin' };
            }
        });
    }
};
```

> **The server will crash during start, if a route is already defined!**

### Updating a Plugin

> This guide is for updating a plugin in a server environment (_staging_, _production_).

The easiest way to fully update is by connecting to the server with ssh and navigating to the desired plugins location. There you can pull the latest changes with (eg. `git pull`) and then restart the running API server with PM2.

**This way of updating is necessary every time the server code of a plugin changes (usually located in `api.cjs`).**

Some plugins register visualizations and provide static assets like JS and CSS to render charts. If only the static assets change, a full server restart is not necessary. In this case, the API provides admin endpoints to update the static files of a plugin. By calling `POST /v3/admin/plugins/update` with the name and branch of the plugin `{ "name": "d3-lines", "branch": "master" }`, the API will download the new static files and replace them. Now the new files are served and used for chart previews and publishing. The following folders inside a plugins directory will get replaced: `less/, locale/, static/`.

> **Note**: The process of updating only static files is not ideal and could cause inconsistent states in the API server. In practice this should not be a problem.
>
> With our implementation of zero downtime API reloads, thanks to PM2, we should be able to programmatically trigger full plugin updates in the future. So far our special case for visualizations solves the problem.

### Updating translations

You can update the translations in `api` (and other services and plugins) by running

```bash
npm run update-translations
```

The script will only write translations to repositories which are up to date or ahead of their counterpart on Github. You can bypass this check by adding the `--no-git-check` flag:

```bash
npm run update-translations -- --no-git-check
```

If you only want to update translations for a certain part of Datawrapper you can use the `--prefix` flag:

```bash
npm run update-translations -- --prefix=plugins/d3-bars
```

### Development

#### Unit tests

To run the unit tests, run:

```shell
make test
```

or to run only some tests:

```shell
make test m='chart has*'
```

This will start a Docker container with a testing database, create tables in it, and run the unit
tests in another container.

The database container will keep running after the tests finish, so you can run `make test`
repeatedly and it will save some time by reusing the database and its tables.

When you're done developing the unit tests, or when you change database schema, you can stop the
database Docker container and delete the database using:

```shell
make test-teardown
```

##### Linking npm packages into unit tests

If you'd like to run the unit tests with a linked npm package, mount it as a readonly Docker volume
in the Makefile target `test-run` like this:

```makefile
test-run:  ## Run command specified by the variable 'cmd' in the testing node container
	$(docker_compose) run --rm \
		-e "DW_CONFIG_PATH=$(DW_CONFIG_PATH)" \
		-e "NODE_ENV=test" \
        -v "$$(pwd)/../../libs/orm:/app/node_modules/@datawrapper/orm:ro" \
		node $(cmd)
```

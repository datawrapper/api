# @datawrapper/api

This repository contains the new Node.js API that is the backbone of Datawrapper 2.0.

## Table of contents

1. [Installation](#installation)
1. [Local development](#local-development)
1. [Configuration](#configuration)
1. [Plugins](#plugins)
    1. [`npm` plugins](#npm-plugins)
    1. [Local plugins](#local-plugins)
        1. [`hello-world`](#hello-world)
        1. [`email-local`](#email-local)
1. [`create-api` script](./create-api/Readme.md)
1. [REST API with JSON](#rest-api-with-json)

## Installation

To run a production instance of this API, a `npm` initialization script is available with `npm init @datawrapper/api`. In it's essence, the following 3 commands are the setup. To get a more in depth look, read the sections about [configuration](#configuration) and [plugins](#plugins). That is the real strength of the API.

```sh
# Create an empty folder where you want the API to initialize
> mkdir new-api && cd new-api

# Copy config (not needed if `config.js` is anywhere up in the tree from `new-api/`)
> cp ./secret/config.js config.js

# Initialize API with npm
> npm init @datawrapper/api
```

You can start the server using:

```sh
npm run api
```

It is recommended to use the start script with a service manager like [PM2](https://pm2.io/runtime/) or `systemd` to guarantee best availability. They will also restart the API in case something crashes.

To make sure the database is in sync after ORM updates, run:

```sh
npm run sync
```

## Local development

Contributions to the API are always welcome. To develop new features or add some documentation, clone the repository and get going.

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

The API will not start without a valid `config.js`. The repository includes a template `config.tpl.js` that can be used to create the configuration file.

`config.js` exports a javascript object with various configuration objects that are used by this project, as well as others, like the `render-client` or `render-server`.
The following objects are used by the API.

### `api`

Key | Example Value | Description
---------|----------|---------
`api.port` | `3000` | Network port the node process will be running on.
`api.domain` | `"datawrapper.de"` | Domain where the API will be available at and used for the session cookies `Domain` value.
`api.subdomain` | `"api"` | Subdomain where the API will be available. Value will be combined with `api.domain`. If the session cookie is supposed to be available only under the subdomain, it can be included in `api.domain` and this key can be removed.
`api.sessionID` | `"DW-SESSION"` | Name for session cookie.
`api.https` | `true` | Flag if the API is served over `https`. This will most likely be `false` in development.
`api.hashRounds` | `15` | Number of hashing rounds for password hashing with `bcrypt`. This value should be configured according to the hardware, the server is running on. As a guideline, the `/auth/login` endpoint should take about 2s for a response.
`api.enableMigration` | `true` | The old API saved password hashes as `sha256` which is not up to current standards. This flag will enable on the fly hash migration to `bcrypt` when a user with old hash logs in.
`api.authSalt` | `"SALT"` | This key is deprecated and only used for legacy hash comparison.
`api.secretAuthSalt` | `"SECRET_SALT"` | This key is deprecated and only used for legacy hash comparison.

### `orm`

Key | Example Value | Description
---------|----------|---------
`orm.db.dialect` | `"mysql"` | Database dialect
`orm.db.host` | `"127.0.0.1"` | Database host
`orm.db.port` | `3306` | Database port
`orm.db.user` | `"user"` | Database user
`orm.db.password` | `"super-secret-password"` | Database password
`orm.db.database` | `"datawrapper"` | Database name

### `frontend`

Key | Example Value | Description
---------|----------|---------
`api.https` | `true` | Flag if the Frontend is served over `https`. Value is used to generate links to certain frontend pages like password reset.
`domain` | `"datawrapper.de"` | Frontend domain. Value is used to generate links to certain frontend pages like password reset.

### `plugins`

Key | Example key | Example Value |  Description
---------|----------| --------- | ---------
`plugin.<plugin-name>` | `plugin[my-plugin]` | `{}` | Configuration options for plugin
|| `plugin[my-plugin].version` | `1.0.0` | Plugin version to install from `npm`
|| `plugin[my-plugin].apiKey` | `agamotto` | Configuration key passed to the plugins register function when server starts.

## Plugins

The API is extensible to match customers and Datawrappers needs. By default the API has endpoints for basic functionality like user and chart management. This functionality can be extended with the use of plugins. Since the API is built on top of the [Hapi](https://hapijs.com) server framework, it uses [Hapis plugin system](https://hapijs.com/api#plugins). Everything a Hapi plugin can do, an API plugin can, too.

For production use, it is recommended to install plugins with `npm`. The `create-api` script will try to automatically install all plugins that are configured in `config.js`. When starting the API server, it will check which plugins are configured in `config.js` and pass the configuration objects to the plugins `register` function with `options.config`. Plugins will have access to ORM models through `options.models`.

In its simplest form, an API plugin is a node module that exports an object with `name`, `version` and `register` keys.

```js
/* config.js */

plugins: {
    'my-plugin': {
        apiKey: 'agamotto'
    }
}

/* index.js */
module.exports = {
    name: 'my-plugin',
    version: '1.0.0',
    register: (server, options) => {
        console.log('hello from my-plugin!')
        console.log(`the api key is "${options.config.apiKey}"`) // the api key is "agamotto"
    }
}
```

### `npm` plugins

Plugins can be installed from `npm`. Even though they can have any name, it is recommended to follow a naming guideline. Plugins developed by Datawrapper will follow the naming convention `@datawrapper/plugin-{name}`. Community or customer developed plugins should be named `dw-plugin-{name}` to make them easy to find on `npm`.

#### Datawrapper plugins

* [@datawrapper/plugin-export-pdf](https://www.npmjs.com/package/@datawrapper/plugin-export-pdf) - Adds file export methods
* [@datawrapper/plugin-random-data](https://www.npmjs.com/package/@datawrapper/plugin-random-data) - Adds endpoint to generate random CSV data
* [@datawrapper/plugin-email-postmark](https://www.npmjs.com/package/@datawrapper/plugin-email-postmark) - Adds email functionality with [Postmark](https://postmarkapp.com) API

### Local plugins

Plugins can be loaded from the local file system. This is very useful for plugin development. The plugin needs to be a folder inside the `plugins/` directory, with an `index.js`.

```
plugins
├── email-local
│   └── index.js
└── hello-world
    └── index.js
```

After cloning the repository for local development, there are 2 local plugins available as examples, `email-local` and `hello-world`.

#### `hello-world`

Example plugin that registers a new API route `GET /hello-world`. It demonstrates how to add new routes to the API. 

> The server will crash during start, if a route is already defined!

```js
module.exports = {
    name: 'hello-world',
    version: '1.0.0',
    register: (server, options) => {
        server.route({
            method: 'GET',
            path: '/hello-world',
            config: { auth: false, tags: ['api', 'plugin'] },
            handler: (request, h) => {
                return { data: 'Hello from plugin' };
            }
        });
    }
};
```

#### `email-local`

Example plugin that uses [`nodemailer`](https://nodemailer.com/about/) and [Ethereal](https://ethereal.email) to generate fake emails. This makes testing of email sending through the API very easy and gives the `sendMail` server method actual functionality.

With this plugin, sending a password reset request will log some data and a URL where to find the fake email.

```
["2019-04-08T08:37:26.526Z"] DEBUG (2.0.0-beta.16): [local-email] reset-password
    url: "https://ethereal.email/message/XKsIQ-btaQzasdfafZGnXKsIRo2TXwy5QPX-AAAAAYLtrIcE0up1bkcjxytMQNo"
    to: "user@email.de"
    language: "de_DE"
    data: {
      "reset_password_link": "http://datawrapper.localhost/account/reset-password/BhjU3c5bLZSwAbqX0UInB83Cb"
    }
```

> Ethereal is a fake SMTP service, it never delivers emails and deletes messages after 7 days.

## REST API with JSON

Will serve via HTTPS on port 443, e.g.

    GET https://api.datawrapper.de/v3/charts/12345
    PUT https://api.datawrapper.de/v3/charts/12345/data

Will be used by our own web app as well as third-party apps maintained by our customers.

For a while we also need to support the old API endpoint via https://api.datawrapper.de/v2/ and https://api.datawrapper.de/ which will be proxied to the PHP app. Eventually the old endpoints will be retired and replaced with v3 versions.

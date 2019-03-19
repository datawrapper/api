# @datawrapper/api

This repository contains the new Node.js API that is the backbone of Datawrapper 2.0.

### Installation

```sh
# Create an empty folder where you want the API to initialize
> mkdir new-api
> cd new-api
# Copy config (not needed if `config.js` is anywhere up in the tree from `new-api/`)
> cp ./secret/config.js config.js
# Initialize API with npm
> npm init @datawrapper/api
```

Then you can start the server using:

```sh
npm run api
```

To make sure the database is in sync after ORM updates, run:

```sh
npm run sync
```

### Local development

```sh
> git clone git@github.com:datawrapper/api.git
> npm install
> cp config.tpl.js config.js
# edit config.js and enter local database location and user credentials
> npm run dev
# API running on some port
```

### REST API with JSON

Will serve via HTTPS on port 443, e.g.

    GET https://api.datawrapper.de/v3/charts/12345
    PUT https://api.datawrapper.de/v3/charts/12345/data

Will be used by our own web app as well as third-party apps maintained by our customers.

For a while we also need to support the old API endpoint via https://api.datawrapper.de/v2/ and https://api.datawrapper.de/ which will be proxied to the PHP app. Eventually the old endpoints will be retired and replaced with v3 versions.

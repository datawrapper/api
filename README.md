# datawrapper-api

This repository contains the new Node.js based API that will power the future of Datawrapper.

## Open questions

### ORM
What ORM to use? Currently trying: [sequelize](http://docs.sequelizejs.com/)

### Plugins

How to deal with plugins in the future. In the PHP app we would decide on each request what plugins to load, based on the authenticated user and his organizations and products. In Node I guess we need to load all plugins but then find another way to manage the access levels. This is a big question. Also, since we're probably splitting the datawrapper api and the frontend in the future (or not?), does this mean we are going to need two kinds of plugins? api-plugins and frontend-plugins?

### Frontend framework

The current favorite is [Sapper](http://sapper.svelte.technology/) since it's designed to work with Svelte and it's following the same design principles. Other ideas?

### Should frontend and backend (api) be two different projects or live in one repository?

In the end they're going to be two web-apps running on separate domains (app.datawrapper.de and api.datawrapper.de). So we might split them into two repositories. But there might be some overlap, like the ORM models would be good to be able to use in both projects. Thoughts?

## Interfaces

It will consist of several interfaces:

* REST API with JSON
* Websocket API 
* Raw Socket API

### REST API with JSON

Will serve via HTTPS on port 443, e.g. 

    GET https://api.datawrapper.de/v3/charts/12345
    PUT https://api.datawrapper.de/v3/charts/12345/data
    ...

Will be used by our own web app as well as third-party apps maintained by our customers.

For a while we also need to support the old API endpoint via https://api.datawrapper.de/v2/ and https://api.datawrapper.de/ which will be proxied to the PHP app. Eventually the old endpoints will be retired and replaced with v3 versions.

### Raw Socket API

The Raw Socket API will be used by our render clients (formerly known as chromeshots) to get export jobs assigned to them.

### Websocket API

Will be used by own own web app to enable real-time two-way communication while using the chart editor (e.g. to push changes made by user A to the open chart editor in user B's browser)

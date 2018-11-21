# datawrapper-api

This repository contains the new Node.js based API that will power the future of Datawrapper.

It will consist of several interfaces:

* REST API with JSON
* Websocket API 
* Raw Socket API

## REST API with JSON

Will serve via HTTPS on port 443, e.g. 

    GET https://api.datawrapper.de/v3/charts/12345
    PUT https://api.datawrapper.de/v3/charts/12345/data
    ...

Will be used by our own web app as well as third-party apps maintained by our customers.

For a while we also need to support the old API endpoint via https://api.datawrapper.de/v2/ and https://api.datawrapper.de/ which will be proxied to the PHP app. Eventually the old endpoints will be retired and replaced with v3 versions.

## Raw Socket API

The Raw Socket API will be used by our render clients (formerly known as chromeshots) to get export jobs assigned to them.

## Websocket API

Will be used by own own web app to enable real-time two-way communication while using the chart editor (e.g. to push changes made by user A to the open chart editor in user B's browser)

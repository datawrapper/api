# `@datawrapper/create-api`

Tool to quickly create a new Datawrapper API. With a given config, this tool installs the API, plugins and needed scripts to get starting.

## Usage

```sh
# Create an empty folder where you want the API to initialize
> mkdir new-api
> cd new-api
# Copy config (not needed if `config.js` is anywhere up in the tree from `new-api/`)
> cp ./secret/config.js config.js
# Initialize API with npm
> npm init @datawrapper/api
```

> HINT: If you already have a `config.js` anywhere up your file tree, `create-api` will search it and use the first one it finds.

`npm init @datawrapper/api` will install `@datawrapper/api@latest`, if you want any other version you can use version numbers or npm `dist-tags`. As an example, when you work on a new feature and released a beta version with the tag `next`, it is possible to initialize the API with `npm init @datawrapper/api --tag=next`.

Any tag or version of the package is valid `--tag=<tag|version>`.

---

`npm init` supports initializers which this tool uses. Documentation can be found on the npm website at [https://docs.npmjs.com/cli/init](https://docs.npmjs.com/cli/init#description).

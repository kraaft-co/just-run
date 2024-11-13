# JustRun

JustRun is a simple yet efficient tool built to compile your code on the fly 
so you don't have to re-build your tool in a `post-install` script everytime.
The final goal is to be able to run any internal tool as if it were installed by your package manager.

This tool exists because the JS ecosystem moves slowly towards typescript, but some pieces are still missing.
This tool should be totally useless in the coming years.
It is somehow equivalent to `swc-node/register`, you can read more about this in the **Alternative solution** section.


## How to build a tool (script)

You created a tool "scripts/list-files" using typescript.
(Lets pretends this tool simply create a list of file within the current directory.)
You want other developers to be able to run `yarn run list-files`from within 
any other workspace and maybe add it to your CI.

Lets say your folder structure is this
```
list-file/
├─ src/
│  ├─ utils/
│  │  ├─ ...
│  ├─ index.ts
├─ package.json
```

### Create an index.js entry point 
At the root of your module (ex: `list-file`), add:
```javascript
#!/usr/bin/env node
const { justRun } = require('just-run');

justRun({
    cwd: __dirname,
    mainFile: "lib/helloTest.js",
    buildCommand: "tsc",
    source: ["./src"],
    enableLog: false,
    type: "script",
});
```
### Update the list-files package.json

```diff
{
   "name": "list-files",
+  "bin": "index.js"
}
```

### Use the tool
IF you want to use it as a **script**, in your package (ex: `frontend/package.json`) add:

```json
{
  "scripts": {
    "list-files": "list-files ./"
  },
  "devDependenciess": {
    "@foobar/list-files": ":*"
  }
}
```


## How to build a module

Now, what if you need to create an eslint plugin in Typescript,
but eslint only accepts JavaScript plugin, and you don't want to publish your plugin.
You would have to compile it in a post-install script somehow, or add compiled js file to github.

OR you can just use this tool as an entry-point for your eslint plugin.

Lets say your folder structure is this
```
eslint-plugin-your-plugin/
├─ src/
│  ├─ utils/
│  │  ├─ ...
│  ├─ index.ts
├─ package.json
```

### Create an index.js entry point 
At the root of your module (ex: `eslint-plugin-your-plugin`), add:
```javascript
#!/usr/bin/env node
const { justRun } = require('just-run');

justRun({
    cwd: __dirname,
    mainFile: "lib/helloTest.js",
    buildCommand: "tsc",
    source: ["./src"],
    enableLog: false,
    type: "module", // ← make sure to use "module" here
});
```
### Update the eslint-plugin-your-plugin package.json

```diff
{
   "name": "list-files",
   +  "main": "index.js"
}
```

And now you should be able to access it via any js file like this:
```javascript
// someCode.js
const listFile = require("@foobar/list-files");
listFile();
```


## Options

- `buildCommand` - The build command to execute. (You can use the tool you want)
- `cwd` - The current working directory for running the tool.
- `mainFile` - The main entrypoint/executable.
- `enableLog` - Whether to enable log or not.
- `type` - "module" if you want to export transpile code, "script" if you just want to run it.
- `source` - An array of source files used to compute the cache key


## Alternative solutions

**[@swc-node/register](https://www.npmjs.com/package/@swc-node/register)** :
- **pros** :
  probably well maintained, well documented, standard, equivalent DX.
- **cons** : only deal with typescript files, only use swc compiler, no-cache.
```javascript
//index.js
require("@swc-node/register");
module.exports = require("./myFile"); // your ts-file
// The package.json config stills need to be done dpending on what you are trying to achieve 
```


## Contributing

We welcome any contributions! If you wish to contribute, please create a new pull-request with your amazing features or bug fixes.

#!/usr/bin/env node
const { justRun } = require("./../lib/index");

justRun({
  cwd: __dirname,
  mainFile: "lib/helloTest.js",
  buildCommand: "tsc",
  source: ["./src", "./compileAndRun.js"],
  enableLog: false,
  type: "script",
});

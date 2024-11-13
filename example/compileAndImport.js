// eslint-disable-next-line @typescript-eslint/no-var-requires
const { justRun } = require("./../lib/index");

const { hello } = justRun({
  cwd: __dirname,
  mainFile: "lib/helloTest.js",
  buildCommand: "tsc",
  source: ["./src", "./compileAndImport.js"],
  enableLog: false,
  type: "module",
});

console.log(hello("la tcheam"));

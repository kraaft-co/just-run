/* eslint-disable @typescript-eslint/no-var-requires */

const nodePath = require("node:path");
const nodeFs = require("node:fs");
const { hashInputs, hashInputsSync } = require("./cache");
const { logger } = require("./logger");
const { execute, executeSync } = require("./execute");

/**
 * Executes a tool with the provided options.
 *
 * @param {Object} options - The options for running the tool.
 * @param {string} options.buildCommand - The build command to execute.
 * @param {string} options.cwd - The current working directory for running the tool.
 * @param {string} options.mainFile - The main entrypoint/ executable.
 * @param {boolean} options.enableLog - Whether to enable log or not.
 * @param {Array<string>} options.source - An array of source files used to calculate the cache key
 *
 * @return {any} - This method does not return anything.
 */
async function runAsync(options = {}) {
  logger.enableLogger(options.enableLog);
  const cacheFile = nodePath.join(options.cwd, ".run-tool-cache");
  try {
    const [node, name, ...params] = process.argv;
    const compiledExecutable = nodePath.join(options.cwd, options.mainFile);
    logger.log(`Trying to run ${compiledExecutable}`);
    const hash = await hashInputs(options.source, options.cwd);

    const fileExist = await nodeFs.promises
      .stat(cacheFile)
      .then((it) => it.isFile())
      .catch(() => false);

    const previousHash = fileExist
      ? nodeFs.readFileSync(cacheFile, {
          encoding: "utf-8",
        })
      : null;

    if (previousHash) {
      logger.log("Cache file exist", previousHash);
    }

    if (hash !== previousHash) {
      logger.log("Hash changed");
      await execute(options.buildCommand, { cwd: options.cwd });
      nodeFs.writeFileSync(cacheFile, hash, { encoding: "utf-8" });
    } else {
      logger.log("Reusing cache");
    }

    logger.log("compiledExecutable", compiledExecutable);
    await execute(`node ${compiledExecutable} ${params.join(" ")}`, {
      stdio: "inherit",
      cwd: options.cwd,
    });
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

/**
 * Transpile source code if necessary and run it synchronously, the result of the mainFile is returned.
 *
 * @param {Object} options - The options for running the tool.
 * @param {string} options.buildCommand - The build command to execute.
 * @param {string} options.cwd - The current working directory for running the tool.
 * @param {string} options.mainFile - The main entrypoint/ executable.
 * @param {boolean} options.enableLog - Whether to enable log or not.
 * @param {Array<string>} options.source - An array of source files used to compute the cache key
 *
 * @return {any} - whatever your mainFile return.
 */
function runSync(options = {}) {
  logger.enableLogger(options.enableLog);
  const cacheFile = nodePath.join(options.cwd, ".run-tool-cache");
  try {
    const [node, name, ...params] = process.argv;
    const compiledExecutable = nodePath.join(options.cwd, options.mainFile);
    logger.log(`Trying to run ${compiledExecutable}`);
    const hash = hashInputsSync(options.source, options.cwd);

    const fileExist = (() => {
      try {
        nodeFs.statSync(cacheFile);
        return true;
      } catch (e) {
        return false;
      }
    })();

    const previousHash = fileExist
      ? nodeFs.readFileSync(cacheFile, {
          encoding: "utf-8",
        })
      : null;

    if (previousHash) {
      logger.log("Cache file exist", previousHash);
    }

    if (hash !== previousHash) {
      logger.log("Hash changed", hash, previousHash);
      executeSync(options.buildCommand, { cwd: options.cwd });
      nodeFs.writeFileSync(cacheFile, hash, { encoding: "utf-8" });
    } else {
      logger.log("Reusing cache");
    }

    logger.log("compiledExecutable", compiledExecutable);
    return require(compiledExecutable);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

/**
 * Executes a tool with the provided options.
 *
 * @param {Object} options - The options for running the tool.
 * @param {string} options.buildCommand - The build command to execute.
 * @param {string} options.cwd - The current working directory for running the tool.
 * @param {string} options.mainFile - The main entrypoint/ executable.
 * @param {boolean} options.enableLog - Whether to enable log or not.
 * @param {"module"|"executable"} options.type - Whether to enable log or not.
 * @param {Array<string>} options.source - An array of source files used to compute the cache key
 *
 * @return {any} - whatever your {@link mainFile} file return
 */
function justRun(options = {}) {
  if (options.type === "module") {
    return runSync(options);
  }
  return runAsync(options);
}

module.exports = {
  justRun: justRun,
};

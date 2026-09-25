/* eslint-disable @typescript-eslint/no-var-requires */

const nodePath = require("node:path");
const nodeFs = require("node:fs");
const nodeUtil = require("node:util");
const { hashInputs, hashInputsSync } = require("./cache");
const { logger, writeStderrSync } = require("./logger");
const { execute, executeSync } = require("./execute");
const { withBuildLock, withBuildLockSync } = require("./lock");

/**
 * Executes a tool with the provided options.
 *
 * @param {Object} options - The options for running the tool.
 * @param {string} options.buildCommand - The build command to execute.
 * @param {string} options.cwd - The current working directory for running the tool.
 * @param {string} options.mainFile - The main entrypoint/ executable.
 * @param {boolean} options.enableLog - Whether to enable log or not.
 * @param {boolean} [options.exclusiveBuild=true] - Only let one process at a time check the cache and build.
 * @param {number} [options.exclusiveBuildTimeout=60000] - How long (ms) a process waits for the build lock before warning. A lock whose holder cannot be identified is taken over after it.
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
    const buildIfNeeded = () =>
      buildIfNeededAsync(options, cacheFile, compiledExecutable);
    if (options.exclusiveBuild === false) {
      await buildIfNeeded();
    } else {
      await withBuildLock(options.cwd, options.exclusiveBuildTimeout, buildIfNeeded);
    }

    logger.log("compiledExecutable", compiledExecutable);
    await execute([process.execPath, compiledExecutable, ...params], {
      stdio: "inherit",
      cwd: process.cwd(),
    });
  } catch (e) {
    writeStderrSync(`${nodeUtil.inspect(e)}\n`);
    process.exit(1);
  }
}

/**
 * Builds when the sources changed or the compiled executable is missing, then
 * records the new cache key.
 */
async function buildIfNeededAsync(options, cacheFile, compiledExecutable) {
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

  const compiledExecutableExists = await nodeFs.promises
    .stat(compiledExecutable)
    .then((it) => it.isFile())
    .catch(() => false);

  if (hash !== previousHash || !compiledExecutableExists) {
    logger.log("Hash changed or compiled executable is missing");
    await execute(options.buildCommand, { cwd: options.cwd });
    nodeFs.writeFileSync(cacheFile, hash, { encoding: "utf-8" });
  } else {
    logger.log("Reusing cache");
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
 * @param {boolean} [options.exclusiveBuild=true] - Only let one process at a time check the cache and build.
 * @param {number} [options.exclusiveBuildTimeout=60000] - How long (ms) a process waits for the build lock before warning. A lock whose holder cannot be identified is taken over after it.
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
    const buildIfNeeded = () =>
      buildIfNeededSync(options, cacheFile, compiledExecutable);
    if (options.exclusiveBuild === false) {
      buildIfNeeded();
    } else {
      withBuildLockSync(options.cwd, options.exclusiveBuildTimeout, buildIfNeeded);
    }

    logger.log("compiledExecutable", compiledExecutable);
    return require(compiledExecutable);
  } catch (e) {
    writeStderrSync(`${nodeUtil.inspect(e)}\n`);
    process.exit(1);
  }
}

/**
 * Same as {@link buildIfNeededAsync} but sync.
 */
function buildIfNeededSync(options, cacheFile, compiledExecutable) {
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

  const compiledExecutableExists = (() => {
    try {
      return nodeFs.statSync(compiledExecutable).isFile();
    } catch (e) {
      return false;
    }
  })();

  if (hash !== previousHash || !compiledExecutableExists) {
    logger.log("Hash changed or compiled executable is missing", hash, previousHash);
    executeSync(options.buildCommand, { cwd: options.cwd });
    nodeFs.writeFileSync(cacheFile, hash, { encoding: "utf-8" });
  } else {
    logger.log("Reusing cache");
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
 * @param {boolean} [options.exclusiveBuild=true] - Only let one process at a time check the cache and build.
 * @param {number} [options.exclusiveBuildTimeout=60000] - How long (ms) a process waits for the build lock before warning. A lock whose holder cannot be identified is taken over after it.
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

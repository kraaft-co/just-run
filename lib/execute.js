/* eslint-disable @typescript-eslint/no-var-requires */
const { logger } = require("./logger");
const childProcess = require("node:child_process");

/**
 * spawn reports a command it could not start through an `error` event, which is
 * fatal when unhandled. ENOENT says nothing useful on its own, so name the
 * command and the PATH it was looked up in.
 *
 * @param {string} commandName
 * @param {Error & {code?: string}} error
 */
function describeSpawnFailure(commandName, error) {
  if (error.code !== "ENOENT") {
    return error;
  }
  return new Error(
    `Could not run \`${commandName}\`: not found in PATH=${process.env.PATH}`
  );
}

/**
 * Executes a command in the shell.
 *
 * @param {string|Array<string>} cmd - The command to execute. An array is taken
 *   as argv, which a string cannot express once any argument holds a space.
 * @param {SpawnOptions} options - The options to pass to the spawned child process.
 */
async function execute(cmd, options = {}) {
  const [commandName, ...args] = Array.isArray(cmd) ? cmd : cmd.split(" ");
  return new Promise((resolve, reject) => {
    logger.log("Executing command : ", [commandName, ...args].join(" "));
    const child = childProcess.spawn(commandName, args, {
      stdio: logger.isEnabled ? "inherit" : "ignore",
      ...options,
    });

    child.on("error", (error) => {
      reject(describeSpawnFailure(commandName, error));
    });

    child.on("exit", function (code) {
      if (code === 0) {
        resolve(void 0);
      } else {
        reject(new Error(`\`${commandName}\` exited with code ${code}`));
      }
    });
  });
}

/**
 * Same as {@link execute} but sync
 */
function executeSync(cmd, options = {}) {
  const [commandName, ...args] = Array.isArray(cmd) ? cmd : cmd.split(" ");
  logger.log("Executing command : ", [commandName, ...args].join(" "));
  // Output is kept even with logging off so a failure can be explained. Both
  // streams are needed: tsc, for one, reports its errors on stdout.
  const result = childProcess.spawnSync(commandName, args, {
    stdio: logger.isEnabled ? "inherit" : ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });

  if (result.error) {
    throw describeSpawnFailure(commandName, result.error);
  }

  if (result.status !== 0) {
    for (const output of [result.stdout, result.stderr]) {
      if (output && output.length > 0) {
        process.stderr.write(output);
      }
    }
    const reason =
      result.status === null
        ? `was killed by ${result.signal}`
        : `exited with code ${result.status}`;
    throw new Error(`\`${commandName}\` ${reason}`);
  }
}

module.exports = {
  execute,
  executeSync,
};

/* eslint-disable @typescript-eslint/no-var-requires */
const { logger } = require("./logger");
const childProcess = require("node:child_process");

/**
 * Executes a command in the shell.
 *
 * @param {string} cmd - The command to execute.
 * @param {SpawnOptions} options - The options to pass to the spawned child process.
 */
async function execute(cmd, options = {}) {
  const [commandName, ...args] = cmd.split(" ");
  return new Promise((resolve, reject) => {
    logger.log("Executing command : ", [commandName, ...args].join(" "));
    const child = childProcess.spawn(commandName, args, {
      stdio: logger.isEnabled ? "inherit" : "ignore",
      ...options,
    });

    child.on("exit", function (code) {
      if (code === 0) {
        resolve(void 0);
      } else {
        reject();
      }
    });
  });
}

/**
 * Same as {@link execute} but sync
 */
function executeSync(cmd, options = {}) {
  const [commandName, ...args] = cmd.split(" ");
  logger.log("Executing command : ", [commandName, ...args].join(" "));
  childProcess.spawnSync(commandName, args, {
    stdio: logger.isEnabled ? "inherit" : "ignore",
    ...options,
  });
}

module.exports = {
  execute,
  executeSync,
};

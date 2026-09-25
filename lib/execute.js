/* eslint-disable @typescript-eslint/no-var-requires */
const { logger, writeStderrSync } = require("./logger");
const childProcess = require("node:child_process");
const nodeFs = require("node:fs");
const nodeOs = require("node:os");
const nodePath = require("node:path");

// How much of a failed command's output is shown: its end holds the errors.
const OUTPUT_TAIL_BYTES = 1024 * 1024;

/**
 * Keeps a command's output even with logging off, so a failure can be
 * explained. It goes to a temporary file rather than memory: there is no size
 * limit for a noisy build to hit, stdout and stderr stay in order (tsc, for
 * one, reports its errors on stdout), and only the end is read back.
 */
function captureOutput() {
  const dir = nodeFs.mkdtempSync(nodePath.join(nodeOs.tmpdir(), "just-run-"));
  const fd = nodeFs.openSync(nodePath.join(dir, "output"), "w+");
  return {
    fd,
    tail() {
      const size = nodeFs.fstatSync(fd).size;
      const length = Math.min(size, OUTPUT_TAIL_BYTES);
      const buffer = Buffer.alloc(length);
      nodeFs.readSync(fd, buffer, 0, length, size - length);
      if (length === size) {
        return buffer;
      }
      const omitted = `[justRun]: ${size - length} bytes of output omitted\n`;
      return Buffer.concat([Buffer.from(omitted), buffer]);
    },
    dispose() {
      nodeFs.closeSync(fd);
      nodeFs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

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
  const output =
    logger.isEnabled || options.stdio ? null : captureOutput();
  try {
    const result = childProcess.spawnSync(commandName, args, {
      stdio: output ? ["ignore", output.fd, output.fd] : "inherit",
      ...options,
    });

    if (result.error) {
      throw describeSpawnFailure(commandName, result.error);
    }

    if (result.status !== 0) {
      if (output) {
        writeStderrSync(output.tail());
      }
      const reason =
        result.status === null
          ? `was killed by ${result.signal}`
          : `exited with code ${result.status}`;
      throw new Error(`\`${commandName}\` ${reason}`);
    }
  } finally {
    if (output) {
      output.dispose();
    }
  }
}

module.exports = {
  execute,
  executeSync,
};

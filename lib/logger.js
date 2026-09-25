const nodeFs = require("node:fs");

const logger = (function () {
  let isEnable = false;

  function enableLogger(status) {
    isEnable = status;
  }

  function wrapLogFunction(fn) {
    return (...args) => {
      if (isEnable) {
        fn("[justRun]: ", ...args);
      }
    };
  }

  return {
    enableLogger,
    isEnabled: isEnable,
    log: wrapLogFunction(console.log),
    warn: wrapLogFunction(console.warn),
    info: wrapLogFunction(console.info),
    error: wrapLogFunction(console.error),
  };
})();

/**
 * process.stderr.write is asynchronous on a pipe outside Linux, so what is
 * still queued is lost when process.exit follows. fs.writeSync is not, but a
 * non-blocking pipe can refuse a write while full: wait for it to drain.
 *
 * @param {string|Buffer} data
 */
function writeStderrSync(data) {
  const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
  let offset = 0;
  while (offset < buffer.length) {
    try {
      offset += nodeFs.writeSync(2, buffer, offset);
    } catch (e) {
      if (e.code !== "EAGAIN") {
        throw e;
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1);
    }
  }
}

module.exports = {
  logger,
  writeStderrSync,
};

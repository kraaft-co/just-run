/* eslint-disable @typescript-eslint/no-var-requires */
const nodeFs = require("node:fs");
const nodePath = require("node:path");
const { logger } = require("./logger");

const LOCK_DIR_NAME = ".run-tool-lock";
const PID_FILE_NAME = "pid";
const POLL_INTERVAL_MS = 50;
const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * mkdir is atomic: when several processes race for the lock, exactly one of
 * them creates the folder, the others get EEXIST.
 *
 * @param {string} lockDir
 * @return {boolean} whether this process now holds the lock.
 */
function tryAcquire(lockDir) {
  try {
    nodeFs.mkdirSync(lockDir);
  } catch (e) {
    if (e.code === "EEXIST") {
      return false;
    }
    throw e;
  }
  nodeFs.writeFileSync(nodePath.join(lockDir, PID_FILE_NAME), String(process.pid));
  return true;
}

function removeLock(lockDir) {
  nodeFs.rmSync(lockDir, { recursive: true, force: true });
}

function readHolderPid(lockDir) {
  try {
    return Number(nodeFs.readFileSync(nodePath.join(lockDir, PID_FILE_NAME), "utf-8"));
  } catch (e) {
    return null;
  }
}

/**
 * A waiter that timed out may have taken the lock over while this process was
 * still building: only remove the lock if it is still ours.
 */
function release(lockDir) {
  if (readHolderPid(lockDir) === process.pid) {
    removeLock(lockDir);
  }
}

/**
 * The pid file is written right after mkdir, so a missing pid only means the
 * holder has not written it yet: it is treated as alive.
 */
function isHolderDead(lockDir) {
  const pid = readHolderPid(lockDir);
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return false;
  } catch (e) {
    // EPERM: the process exists but belongs to someone else.
    return e.code === "ESRCH";
  }
}

/**
 * Tells a waiting process whether it should stop waiting and take the lock
 * over, because its holder died without releasing it or it has been held for
 * longer than the timeout.
 */
function isStale(lockDir, waitStartedAt, timeout) {
  if (isHolderDead(lockDir)) {
    logger.log("Build lock holder is dead, removing the lock");
    return true;
  }
  if (Date.now() - waitStartedAt > timeout) {
    logger.log(`Waited more than ${timeout}ms for the build lock, removing it`);
    return true;
  }
  return false;
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Runs `fn` while holding the build lock of `cwd`, so that only one process
 * at a time checks the cache and builds. A process that has to wait runs `fn`
 * once the holder is done, by then the cache is fresh and `fn` reuses it.
 *
 * @param {string} cwd - The folder holding the lock.
 * @param {number} timeout - How long to wait before treating the lock as stale.
 * @param {() => T} fn
 * @return {T}
 * @template T
 */
function withBuildLockSync(cwd, timeout = DEFAULT_TIMEOUT_MS, fn) {
  const lockDir = nodePath.join(cwd, LOCK_DIR_NAME);
  let waitStartedAt = Date.now();
  while (!tryAcquire(lockDir)) {
    if (isStale(lockDir, waitStartedAt, timeout)) {
      removeLock(lockDir);
      // Another waiter may win the lock we just freed: wait a full timeout for it.
      waitStartedAt = Date.now();
      continue;
    }
    logger.log("Waiting for another process to finish building");
    sleepSync(POLL_INTERVAL_MS);
  }
  try {
    return fn();
  } finally {
    release(lockDir);
  }
}

/**
 * Same as {@link withBuildLockSync} but async.
 *
 * @param {string} cwd - The folder holding the lock.
 * @param {number} timeout - How long to wait before treating the lock as stale.
 * @param {() => Promise<T>} fn
 * @return {Promise<T>}
 * @template T
 */
async function withBuildLock(cwd, timeout = DEFAULT_TIMEOUT_MS, fn) {
  const lockDir = nodePath.join(cwd, LOCK_DIR_NAME);
  let waitStartedAt = Date.now();
  while (!tryAcquire(lockDir)) {
    if (isStale(lockDir, waitStartedAt, timeout)) {
      removeLock(lockDir);
      // Another waiter may win the lock we just freed: wait a full timeout for it.
      waitStartedAt = Date.now();
      continue;
    }
    logger.log("Waiting for another process to finish building");
    await sleep(POLL_INTERVAL_MS);
  }
  try {
    return await fn();
  } finally {
    release(lockDir);
  }
}

module.exports = {
  withBuildLock,
  withBuildLockSync,
};

/* eslint-disable @typescript-eslint/no-var-requires */
const nodeFs = require("node:fs");
const nodeOs = require("node:os");
const nodePath = require("node:path");
const { logger } = require("./logger");

const LOCK_DIR_NAME = ".run-tool-lock";
const PID_FILE_NAME = "pid";
const POLL_INTERVAL_MS = 50;
const DEFAULT_TIMEOUT_MS = 60_000;
// The takeover guard is only held for a few file operations.
const TAKEOVER_GUARD_STALE_MS = 5_000;
// os.uptime is only precise to the second on some platforms.
const BOOT_TIME_MARGIN_MS = 10_000;

function readHolderPid(lockDir) {
  try {
    const pid = Number(nodeFs.readFileSync(nodePath.join(lockDir, PID_FILE_NAME), "utf-8"));
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  } catch (e) {
    return null;
  }
}

function removeLock(lockDir) {
  nodeFs.rmSync(lockDir, { recursive: true, force: true });
}

/**
 * The lock is prepared in a private folder holding our pid, then renamed into
 * place. rename is atomic and fails when the target is a non-empty folder, so
 * exactly one process wins, and the lock never exists without its pid.
 *
 * @param {string} lockDir
 * @return {boolean} whether this process now holds the lock.
 */
function tryAcquire(lockDir) {
  const preparedDir = `${lockDir}.${process.pid}.tmp`;
  removeLock(preparedDir);
  nodeFs.mkdirSync(preparedDir);
  nodeFs.writeFileSync(nodePath.join(preparedDir, PID_FILE_NAME), String(process.pid));
  try {
    nodeFs.renameSync(preparedDir, lockDir);
    return true;
  } catch (e) {
    removeLock(preparedDir);
    // Windows reports an existing target as EPERM.
    if (["EEXIST", "ENOTEMPTY", "EPERM"].includes(e.code) && nodeFs.existsSync(lockDir)) {
      return false;
    }
    throw e;
  }
}

/**
 * A waiter that took over a lock it could not identify may do so while this
 * process is still building: only remove the lock if it is still ours.
 */
function release(lockDir) {
  if (readHolderPid(lockDir) === process.pid) {
    removeLock(lockDir);
  }
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    // EPERM: the process exists but belongs to someone else.
    return e.code !== "ESRCH";
  }
}

function ageOf(dir) {
  try {
    return Date.now() - nodeFs.statSync(dir).mtimeMs;
  } catch (e) {
    return 0;
  }
}

/**
 * A lock taken before the machine last booted was left by a process that is
 * gone, whatever now runs under its pid: pids start over after a reboot.
 */
function predatesBoot(lockDir) {
  return ageOf(lockDir) > nodeOs.uptime() * 1000 + BOOT_TIME_MARGIN_MS;
}

/**
 * A lock can be taken over when its holder died without releasing it. A live
 * holder is never taken over, however long its build takes: that would start
 * a second build in the same folder. A lock without a readable pid cannot be
 * checked, so it is taken over once it is older than the timeout.
 */
function isStale(lockDir, timeout) {
  if (predatesBoot(lockDir)) {
    return true;
  }
  const pid = readHolderPid(lockDir);
  if (pid === null) {
    return nodeFs.existsSync(lockDir) && ageOf(lockDir) > timeout;
  }
  return !isAlive(pid);
}

/**
 * Several waiters usually see a dead holder at the same time. Without a guard,
 * one removes the lock and acquires it, then another removes that fresh lock.
 * The guard makes the check and the removal one step.
 */
function removeIfStale(lockDir, timeout) {
  const guardDir = `${lockDir}.takeover`;
  try {
    nodeFs.mkdirSync(guardDir);
  } catch (e) {
    if (e.code !== "EEXIST") {
      throw e;
    }
    if (ageOf(guardDir) > TAKEOVER_GUARD_STALE_MS) {
      removeLock(guardDir);
    }
    return;
  }
  try {
    if (isStale(lockDir, timeout)) {
      logger.log("The build lock holder is gone, removing the lock");
      removeLock(lockDir);
    }
  } finally {
    removeLock(guardDir);
  }
}

/**
 * Shown even with logging off: otherwise a process stuck behind a hung build
 * would wait silently.
 */
function warnLongWait(lockDir, timeout) {
  const pid = readHolderPid(lockDir);
  console.warn(
    `[justRun]: waited more than ${timeout}ms for process ${pid} to finish building. ` +
      `If it is stuck, stop it or remove ${lockDir}.`
  );
}

/**
 * Yields while another process holds the lock, until this process holds it.
 * Shared by the sync and async variants, which only differ in how they sleep.
 */
function* acquire(lockDir, timeout) {
  const waitStartedAt = Date.now();
  let warned = false;
  while (!tryAcquire(lockDir)) {
    removeIfStale(lockDir, timeout);
    if (!warned && Date.now() - waitStartedAt > timeout) {
      warnLongWait(lockDir, timeout);
      warned = true;
    }
    logger.log("Waiting for another process to finish building");
    yield;
  }
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
 * @param {number} timeout - How long to wait before warning, and before taking
 *   over a lock whose holder cannot be identified.
 * @param {() => T} fn
 * @return {T}
 * @template T
 */
function withBuildLockSync(cwd, timeout = DEFAULT_TIMEOUT_MS, fn) {
  const lockDir = nodePath.join(cwd, LOCK_DIR_NAME);
  for (const _ of acquire(lockDir, timeout)) {
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
 * @param {number} timeout - How long to wait before warning, and before taking
 *   over a lock whose holder cannot be identified.
 * @param {() => Promise<T>} fn
 * @return {Promise<T>}
 * @template T
 */
async function withBuildLock(cwd, timeout = DEFAULT_TIMEOUT_MS, fn) {
  const lockDir = nodePath.join(cwd, LOCK_DIR_NAME);
  for (const _ of acquire(lockDir, timeout)) {
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

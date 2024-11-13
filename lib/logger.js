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

module.exports = {
  logger,
};

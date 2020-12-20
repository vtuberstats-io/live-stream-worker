const ERROR_TYPES = ['unhandledRejection', 'uncaughtException'];
const SIGNALS = ['SIGTERM', 'SIGINT', 'SIGUSR2'];

async function callActions(actions) {
  for (const action of actions || []) {
    try {
      if (action.constructor.name === 'AsyncFunction') {
        await action();
      } else {
        action();
      }
    } catch {}
  }
}

function registerExitHook(...actions) {
  ERROR_TYPES.forEach((type) => {
    process.on(type, async (err) => {
      console.error(`${type} occurred with error: ${err.stack || err}`);
      console.error('exiting...');
      await callActions(actions);
    });
  });

  SIGNALS.forEach((signal) => {
    process.once(signal, async () => {
      console.warn(`${signal} signal detected, exiting...`);
      try {
        await callActions(actions);
      } finally {
        process.kill(process.pid, signal);
      }
    });
  });
}

module.exports = { registerExitHook };

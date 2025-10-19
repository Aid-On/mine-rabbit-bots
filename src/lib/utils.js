export const sleep = (ms = 0) => new Promise((r) => setTimeout(r, ms));

const locks = new Map();
export async function acquireLock(name, { timeoutMs = 8000, intervalMs = 50 } = {}) {
  const start = Date.now();
  while (locks.get(name)) {
    if (Date.now() - start > timeoutMs) break;
    await sleep(intervalMs);
  }
  locks.set(name, true);
  let released = false;
  return () => { if (!released) { released = true; locks.delete(name); } };
}


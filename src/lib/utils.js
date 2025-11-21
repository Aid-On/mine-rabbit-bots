export const sleep = (ms = 0) => new Promise((r) => setTimeout(r, ms));

// lock name -> acquired timestamp (ms)
const locks = new Map();

export async function acquireLock(name, { timeoutMs = 8000, intervalMs = 50 } = {}) {
  const start = Date.now();
  while (locks.get(name)) {
    if (Date.now() - start > timeoutMs) break;
    await sleep(intervalMs);
  }
  locks.set(name, Date.now());
  let released = false;
  return () => { if (!released) { released = true; locks.delete(name); } };
}

export function releaseLock(name) {
  locks.delete(name);
}

export function lockAge(name) {
  const t = locks.get(name);
  return typeof t === 'number' ? (Date.now() - t) : null;
}

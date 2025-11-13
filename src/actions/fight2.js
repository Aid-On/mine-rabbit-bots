// Helper utilities used by fight.js (split out for clarity)

export const isWeapon = (it) => !!it && /(_sword$|_axe$)/.test(String(it.name || ''));

export const tierRank = (name = '') => {
  if (name.includes('netherite')) return 0;
  if (name.includes('diamond')) return 1;
  if (name.includes('iron')) return 2;
  if (name.includes('stone')) return 3;
  if (name.includes('gold')) return 4;
  if (name.includes('wood')) return 5;
  return 9;
};

export const bestWeapon = (bot) => {
  const inv = bot.inventory.items();
  const swords = inv.filter((it) => /_sword$/.test(it.name));
  if (swords.length) {
    swords.sort((a, b) => tierRank(a.name) - tierRank(b.name));
    return swords[0];
  }
  const axes = inv.filter((it) => /_axe$/.test(it.name));
  if (axes.length) {
    axes.sort((a, b) => tierRank(a.name) - tierRank(b.name));
    return axes[0];
  }
  return null;
};

export const ensureWeaponEquipped = async (bot) => {
  try {
    const hand = bot.heldItem || null;
    if (isWeapon(hand)) return;
    const w = bestWeapon(bot);
    if (w) await bot.equip(w, 'hand');
  } catch (_) {}
};

export const findNearestHostile = (bot, hostileNames) => {
  let best = null;
  let bestD2 = Infinity;
  for (const id in bot.entities) {
    const e = bot.entities[id];
    if (!e || e === bot.entity) continue;
    if (e.type !== 'mob') continue;
    const name = String(e.name || '').toLowerCase();
    if (!hostileNames.has(name)) continue;
    const d2 = e.position.distanceSquared(bot.entity.position);
    if (d2 < bestD2) {
      best = e;
      bestD2 = d2;
    }
  }
  return best;
};

export const findNearestHostileWithin = (bot, hostileNames, radius = 8) => {
  const e = findNearestHostile(bot, hostileNames);
  if (!e) return null;
  const d2 = e.position.distanceSquared(bot.entity.position);
  return d2 <= radius * radius ? e : null;
};

export const findByName = (bot, query) => {
  const q = String(query || '').toLowerCase();
  let best = null;
  let bestD2 = Infinity;
  for (const id in bot.entities) {
    const e = bot.entities[id];
    if (!e || e === bot.entity) continue;
    const name = String(e.name || e.displayName || '').toLowerCase();
    if (!name.includes(q)) continue;
    const d2 = e.position.distanceSquared(bot.entity.position);
    if (d2 < bestD2) {
      best = e;
      bestD2 = d2;
    }
  }
  return best;
};

export const collectNearbyDrops = async (bot, goals, centerPos, { radius = 6, timeoutMs = 4000 } = {}) => {
  const start = Date.now();
  const nearItems = () => Object.values(bot.entities || {})
    .filter((e) => e && e.name === 'item')
    .filter((e) => e.position.distanceSquared(centerPos) <= radius * radius)
    .sort((a, b) => a.position.distanceSquared(bot.entity.position) - b.position.distanceSquared(bot.entity.position));
  while (Date.now() - start < timeoutMs) {
    const items = nearItems();
    if (items.length === 0) { await new Promise((r) => setTimeout(r, 150)); continue; }
    const it = items[0];
    try {
      if (bot.pathfinder?.goto) {
        await bot.pathfinder.goto(new goals.GoalNear(it.position.x, it.position.y, it.position.z, 1));
      }
    } catch (_) {}
    await new Promise((r) => setTimeout(r, 120));
  }
};


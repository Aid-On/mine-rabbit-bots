export function register(bot, commandHandlers, ctx) {
  const say = (m) => { try { bot.chat(m); } catch (_) {} };
  const hasHelp = (arr) => (arr || []).some(a => ['-h','--help','help','ヘルプ','/?','?'].includes(String(a||'').toLowerCase()));

  const getAmbientDark = (p) => {
    try {
      const head = bot.blockAt(p.offset(0, 1, 0));
      const val = (head && typeof head.skyLight === 'number') ? head.skyLight : null;
      // 暗い基準: 夜 or skyLight が低い
      if (bot.time && typeof bot.time.isDay === 'boolean' && !bot.time.isDay) return true;
      if (val !== null && val <= 4) return true;
    } catch (_) {}
    return false;
  };

  const pickLightItem = (name) => {
    const candidates = name ? [name] : ['torch', 'lantern', 'soul_torch', 'redstone_torch'];
    const inv = bot.inventory.items();
    for (const n of candidates) {
      const it = inv.find(i => i?.name === n);
      if (it) return it;
    }
    return null;
  };

  const placeAt = async (pos, itemName) => {
    const item = pickLightItem(itemName);
    if (!item) { say(itemName ? `${itemName} を所持していません` : '光源（torch等）を所持していません'); return false; }
    try { await bot.equip(item, 'hand'); } catch (_) { return false; }
    try {
      const ref = ctx.findPlaceRefForTarget(pos);
      if (!ref) return false;
      bot.setControlState('sneak', true);
      await bot.placeBlock(ref.refBlock, ref.face);
      setTimeout(() => bot.setControlState('sneak', false), 200);
      return true;
    } catch (_) {
      setTimeout(() => bot.setControlState('sneak', false), 200);
      return false;
    }
  };

  const lightHandler = async ({ args = [] }) => {
    if (hasHelp(args)) {
      say('暗い場合に等間隔で光源を設置します。');
      say('使用: light [interval] [count] [itemName]');
      say('例: light 6 10 torch');
      return;
    }
    const interval = Math.max(2, Math.min(16, Number(args[0] || 6) || 6));
    const count = Math.max(1, Math.min(64, Number(args[1] || 8) || 8));
    const itemName = args[2] ? String(args[2]).toLowerCase() : null;

    const base = bot.entity.position.floored();
    const { front } = ctx.yawToDir();
    const dir = front.clone();
    // y成分は落ち着かせる
    dir.y = 0;

    let placed = 0;
    for (let i = 0; i < count; i++) {
      const step = i === 0 ? 0 : interval * i;
      const target = base.plus({ x: Math.round(dir.x * step), y: 0, z: Math.round(dir.z * step) });
      // 足元の高さに合わせる
      const here = bot.blockAt(bot.entity.position.floored());
      const ty = here ? here.position.y : base.y;
      const tp = target.offset(0, ty - target.y, 0);

      if (!getAmbientDark(tp)) continue;
      try { if (ctx.gotoBlock) await ctx.gotoBlock(tp); } catch (_) {}
      const ok = await placeAt(tp, itemName);
      if (ok) placed++;
      await new Promise(r => setTimeout(r, 120));
    }
    say(placed > 0 ? `設置: 光源 x${placed}` : '設置対象がありません（明るい／光源無し）');
  };

  commandHandlers.set('light', lightHandler);
  // 日本語
  commandHandlers.set('照明', (ctx2) => lightHandler(ctx2));
  commandHandlers.set('光', (ctx2) => lightHandler(ctx2));
}

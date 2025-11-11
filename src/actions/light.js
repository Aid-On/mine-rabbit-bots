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
      say('      light once [itemName]  （1つだけ設置）');
      say('例: light 6 10 torch / light once torch');
      return;
    }
    const a0 = String(args[0] || '').toLowerCase();
    const isOnce = ['once','one','1','ここ','一つ','ひとつ'].includes(a0);
    const interval = isOnce ? 6 : Math.max(2, Math.min(16, Number(args[0] || 6) || 6));
    const count = isOnce ? 1 : Math.max(1, Math.min(64, Number(args[1] || 8) || 8));
    const itemName = isOnce ? (args[1] ? String(args[1]).toLowerCase() : null)
                            : (args[2] ? String(args[2]).toLowerCase() : null);

    const base = bot.entity.position.floored();
    const { front } = ctx.yawToDir();
    const dir = front.clone();
    // y成分は落ち着かせる
    dir.y = 0;

    let placed = 0;
    // 掘削は無効化（設置のために道を掘らない）
    const m = bot.pathfinder?.movements;
    const prevCanDig = m && typeof m.canDig === 'boolean' ? m.canDig : null;
    if (m && prevCanDig !== null) m.canDig = false;
    try {
    for (let i = 0; i < count; i++) {
      const step = isOnce ? 0 : (i === 0 ? 0 : interval * i);
      const target = base.plus({ x: Math.round(dir.x * step), y: 0, z: Math.round(dir.z * step) });
      // 足元の高さ基準で、地面+空気セルを上下±2探索
      const here = bot.blockAt(bot.entity.position.floored());
      const ty = here ? here.position.y : base.y;
      const base2D = target.offset(0, ty - target.y, 0);
      let tp = base2D.offset(0, 1, 0);
      const isSolid = ctx.isSolid || (() => false);
      for (let dy = 2; dy >= -2; dy--) {
        const gp = base2D.offset(0, dy, 0);
        const ground = bot.blockAt(gp);
        const head = bot.blockAt(gp.offset(0, 1, 0));
        if (ground && isSolid(ground) && (!head || head.name === 'air')) { tp = gp.offset(0, 1, 0); break; }
      }

      if (!getAmbientDark(tp)) continue;
      // 地面（tpの1つ下）へ移動
      try { if (ctx.gotoBlock) await ctx.gotoBlock(tp.offset(0, -1, 0)); } catch (_) {}
      const ok = await placeAt(tp, itemName);
      if (ok) placed++;
      await new Promise(r => setTimeout(r, 120));
    }
    } finally {
      if (m && prevCanDig !== null) m.canDig = prevCanDig;
    }
    say(placed > 0 ? `設置: 光源 x${placed}` : '設置対象がありません（明るい／光源無し）');
  };

  commandHandlers.set('light', lightHandler);
  // 日本語
  commandHandlers.set('照明', (ctx2) => lightHandler(ctx2));
  commandHandlers.set('光', (ctx2) => lightHandler(ctx2));
}

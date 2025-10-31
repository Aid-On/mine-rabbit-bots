// 自動食事アクション
// bot.js にあった食事ロジックをこちらへ集約

export function register(bot, commandHandlers, ctx) {
  // 状態
  let eating = false;
  let eatTimer = null;
  let lastNoFoodAt = 0;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // 触る食料の優先順位（高→低）
  const foodPriority = [
    'cooked_beef','cooked_porkchop','cooked_mutton','cooked_chicken','baked_potato',
    'cooked_cod','cooked_salmon','bread','golden_carrot','carrot','apple','cookie',
    'beetroot','beetroot_soup','pumpkin_pie','melon_slice','dried_kelp','sweet_berries',
    'mushroom_stew','rabbit_stew','suspicious_stew'
  ];

  const findFoodItem = () => {
    const inv = bot.inventory?.items?.() || [];
    const order = new Map(foodPriority.map((n, i) => [n, i]));
    const foods = inv.filter(it => order.has(it.name));
    foods.sort((a, b) => (order.get(a.name) - order.get(b.name)) || (b.count - a.count));
    return foods[0] || null;
  };

  const eatOnce = async () => {
    const food = findFoodItem();
    if (!food) return false;
    try { await bot.equip(food, 'hand'); } catch (e) { return false; }
    try {
      if (typeof bot.consume === 'function') {
        await bot.consume();
      } else {
        bot.activateItem?.();
        await sleep(1700);
        bot.deactivateItem?.();
      }
      return true;
    } catch (_) { return false; }
  };

  const shouldEat = () => {
    const food = Number(bot.food ?? 0);
    const hp = Number(bot.health ?? 0);
    // 満腹度が半分以下、または体力が満タン未満の時に開始
    return (food <= 10) || (hp < 20);
  };

  const startAutoEat = () => {
    if (eatTimer) clearInterval(eatTimer);
    eatTimer = setInterval(async () => {
      if (eating) return;
      if (!shouldEat()) return;
      // 食料が無ければ通知して終了（連続通知は抑制）
      if (!findFoodItem()) {
        const now = Date.now();
        if (now - lastNoFoodAt > 15000) {
          try { bot.chat('食料を持っていません'); } catch (_) {}
          lastNoFoodAt = now;
        }
        return;
      }
      eating = true;
      try {
        let loops = 0;
        while ((Number(bot.food ?? 0) < 20) && loops++ < 8) {
          const ok = await eatOnce();
          if (!ok) break;
          await sleep(220);
        }
      } catch (_) {
      } finally {
        eating = false;
      }
    }, 1200);
  };

  const stopAutoEat = () => {
    if (eatTimer) clearInterval(eatTimer);
    eatTimer = null;
  };

  // spawn 後に自動開始（元の挙動と同じ）
  bot.once('spawn', () => {
    try { startAutoEat(); } catch (_) {}
  });

  // 簡単な操作コマンド
  const eatHandler = async ({ args = [], sender }) => {
    const hasHelp = (arr) => (arr || []).some(a => ['-h','--help','help','ヘルプ','/?','?'].includes(String(a||'').toLowerCase()));
    if (hasHelp(args)) {
      try {
        bot.chat('自動食事: 満腹<=10や体力未満で食事します。');
        bot.chat('使用: eat [on off once]');
        bot.chat('例: eat on / eat off / eat once');
      } catch (_) {}
      return;
    }
    const sub = (args[0] || 'status').toLowerCase();
    if (sub === 'on' || sub === 'start') { startAutoEat(); try { bot.chat(`@${sender} 自動食事を開始`); } catch (_) {} return; }
    if (sub === 'off' || sub === 'stop') { stopAutoEat(); try { bot.chat(`@${sender} 自動食事を停止`); } catch (_) {} return; }
    if (sub === 'once') {
      try {
        const ok = await eatOnce();
        try { bot.chat(`@${sender} ${ok ? '食べました' : '食べられませんでした'}`); } catch (_) {}
      } catch (e) {
        try { bot.chat(`@${sender} 失敗: ${e?.message || e}`); } catch (_) {}
      }
      return;
    }
    // status
    const status = eatTimer ? 'ON' : 'OFF';
    try { bot.chat(`@${sender} 自動食事: ${status}`); } catch (_) {}
  };

  commandHandlers.set('eat', eatHandler);
  // 日本語エイリアス
  commandHandlers.set('食べる', (ctx2) => eatHandler(ctx2));
  commandHandlers.set('食事', (ctx2) => eatHandler(ctx2));
}

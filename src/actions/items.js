export function register(bot, commandHandlers, ctx) {
  // 集計: ホットバーとインベントリを区別
  const summarizeInventoryGrouped = () => {
    const slots = bot.inventory?.slots || [];
    const hotbarIdx = Array.from({ length: 9 }, (_, i) => 36 + i);   // 36-44
    const invIdx = Array.from({ length: 27 }, (_, i) => 9 + i);      // 9-35

    const collectTotals = (indices) => {
      const totals = new Map();
      for (const i of indices) {
        const it = slots[i];
        if (!it) continue;
        const key = it.name || 'unknown';
        totals.set(key, (totals.get(key) || 0) + (it.count || 0));
      }
      return totals;
    };

    const hotbarTotals = collectTotals(hotbarIdx);
    const invTotals = collectTotals(invIdx);

    // オフハンド（45）は別枠で表示
    const offhand = (() => {
      try { return bot.registry?.isNewerOrEqualTo?.('1.9') ? (slots[45] || null) : null; } catch (_) { return null; }
    })();

    const fmt = (totals) => Array.from(totals.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, count]) => `${ctx.getJaItemName(name)} x${count}`);

    return {
      hotbar: fmt(hotbarTotals),
      inventory: fmt(invTotals),
      offhand: offhand ? `${ctx.getJaItemName(offhand.name)} x${offhand.count}` : null
    };
  };

  const chatChunks = (parts, maxLen = 200) => {
    const chunks = [];
    let cur = '';
    for (const p of parts) {
      const add = cur ? `, ${p}` : p;
      if ((cur + add).length > maxLen) { if (cur) chunks.push(cur); cur = p; } else { cur += add; }
    }
    if (cur) chunks.push(cur);
    return chunks;
  };

  const listHandler = ({ sender }) => {
    const grouped = summarizeInventoryGrouped();
    const isHotbarEmpty = grouped.hotbar.length === 0;
    const isInvEmpty = grouped.inventory.length === 0;
    const isOffEmpty = !grouped.offhand;
    if (isHotbarEmpty && isInvEmpty && isOffEmpty) {
      bot.chat(sender ? `@${sender} inventory: empty` : 'inventory: empty');
      return;
    }

    // ホットバー
    if (!isHotbarEmpty) {
      const chunks = chatChunks(grouped.hotbar);
      chunks.forEach((line, idx) => {
        const head = idx === 0 ? 'ホットバー: ' : '          ';
        bot.chat(sender ? `@${sender} ${head}${line}` : `${head}${line}`);
      });
    } else {
      bot.chat(sender ? `@${sender} ホットバー: (空)` : 'ホットバー: (空)');
    }

    // インベントリ
    if (!isInvEmpty) {
      const chunks = chatChunks(grouped.inventory);
      chunks.forEach((line, idx) => {
        const head = idx === 0 ? 'インベントリ: ' : '            ';
        bot.chat(sender ? `@${sender} ${head}${line}` : `${head}${line}`);
      });
    } else {
      bot.chat(sender ? `@${sender} インベントリ: (空)` : 'インベントリ: (空)');
    }

    // オフハンド
    if (grouped.offhand) {
      bot.chat(sender ? `@${sender} オフハンド: ${grouped.offhand}` : `オフハンド: ${grouped.offhand}`);
    }
  };

  commandHandlers.set('items', listHandler);
  commandHandlers.set('inv', (ctx2) => listHandler(ctx2));
  commandHandlers.set('inventory', (ctx2) => listHandler(ctx2));
  commandHandlers.set('list', (ctx2) => listHandler(ctx2));
}

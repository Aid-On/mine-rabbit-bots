export function register(bot, commandHandlers, ctx) {
  const hasHelp = (arr) => (arr || []).some(a => ['-h','--help','help','ヘルプ'].includes(String(a||'').toLowerCase()));
  const summarizeInventory = () => {
    const stacks = bot.inventory.items().slice();
    try {
      if (bot.registry?.isNewerOrEqualTo?.('1.9') && bot.inventory.slots[45]) {
        stacks.push(bot.inventory.slots[45]); // off-hand
      }
    } catch (_) {}
    if (stacks.length === 0) return [];
    const totals = new Map();
    for (const it of stacks) {
      const key = it?.name || 'unknown';
      if (!it) continue;
      totals.set(key, (totals.get(key) || 0) + it.count);
    }
    return Array.from(totals.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([name, count]) => `${ctx.getJaItemName(name)} x${count}`);
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

  const listHandler = ({ args = [], sender }) => {
    if (hasHelp(args)) { 
      bot.chat('所持品一覧を表示します。');
      bot.chat('使用: items|inv|inventory|list');
      return; 
    }
    const list = summarizeInventory();
    if (list.length === 0) { bot.chat(sender ? `@${sender} inventory: empty` : 'inventory: empty'); return; }
    const lines = chatChunks(list);
    for (const line of lines) bot.chat(sender ? `@${sender} ${line}` : line);
  };

  commandHandlers.set('items', listHandler);
  commandHandlers.set('inv', (ctx2) => listHandler(ctx2));
  commandHandlers.set('inventory', (ctx2) => listHandler(ctx2));
  commandHandlers.set('list', (ctx2) => listHandler(ctx2));
}

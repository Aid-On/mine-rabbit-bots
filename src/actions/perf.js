export function register(bot, commandHandlers, ctx) {
  // perf <light|normal>
  const hasHelp = (arr) => (arr || []).some(a => ['-h','--help','help','ヘルプ'].includes(String(a||'').toLowerCase()));
  commandHandlers.set('perf', ({ args = [], sender }) => {
    if (hasHelp(args)) { try { bot.chat('負荷設定を切替えます（描画や探索距離に影響）。'); bot.chat('使用: perf <light normal>'); } catch (_) {} return; }
    const v = (args[0] || '').toLowerCase();
    if (v === 'light' || v === 'normal') {
      if (typeof ctx.setPerfMode === 'function') ctx.setPerfMode(v);
      bot.chat(sender ? `@${sender} perf: ${v}` : `perf: ${v}`);
    } else {
      bot.chat(sender ? `@${sender} 使用: perf <light|normal>` : 'usage: perf <light|normal>');
    }
  });
}

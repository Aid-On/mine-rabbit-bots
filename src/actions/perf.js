export function register(bot, commandHandlers, ctx) {
  // perf <light|normal>
  commandHandlers.set('perf', ({ args, sender }) => {
    const v = (args[0] || '').toLowerCase();
    if (v === 'light' || v === 'normal') {
      if (typeof ctx.setPerfMode === 'function') ctx.setPerfMode(v);
      bot.chat(sender ? `@${sender} perf: ${v}` : `perf: ${v}`);
    } else {
      bot.chat(sender ? `@${sender} 使用: perf <light|normal>` : 'usage: perf <light|normal>');
    }
  });
}


export function register(bot, commandHandlers) {
  const hasHelp = (arr) => (arr || []).some(a => ['-h','--help','help','ヘルプ'].includes(String(a||'').toLowerCase()));
  commandHandlers.set('jump', ({ args = [], sender }) => {
    if (hasHelp(args)) { try { bot.chat('ジャンプします。使用: jump'); } catch (_) {} return; }
    bot.setControlState('jump', true);
    setTimeout(() => bot.setControlState('jump', false), 500);
  });
}

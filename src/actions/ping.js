export function register(bot, commandHandlers) {
  const hasHelp = (arr) => (arr || []).some(a => ['-h','--help','help','ヘルプ'].includes(String(a||'').toLowerCase()));
  commandHandlers.set('ping', ({ args = [], sender }) => {
    if (hasHelp(args)) { try { bot.chat('応答確認。使用: ping'); } catch (_) {} return; }
    bot.chat('pong');
  });
}

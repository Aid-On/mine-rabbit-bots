export function register(bot, commandHandlers, ctx) {
  const help = (_sender) => { try {
    bot.chat('追従/停止:');
    bot.chat('使用: come | follow | stop');
    bot.chat('例: come（今いる場所へ来る）/ follow（ついてくる）/ stop（やめる）');
  } catch (_) {} };
  const hasHelp = (arr) => (arr || []).some(a => ['-h','--help','help','ヘルプ'].includes(String(a||'').toLowerCase()));

  commandHandlers.set('come', ({ args = [], sender }) => {
    if (hasHelp(args)) { help(sender); return; }
    const player = bot.players[sender];
    if (player?.entity) {
      const { x, y, z } = player.entity.position;
      if (bot.pathfinder?.setGoal) {
        bot.pathfinder.setGoal(new ctx.goals.GoalNear(x, y, z, 1));
      }
    }
  });

  commandHandlers.set('follow', ({ args = [], sender }) => {
    if (hasHelp(args)) { help(sender); return; }
    ctx.log?.(`フォロー開始: ${sender}`);
    ctx.startFollowing?.(sender);
  });

  commandHandlers.set('stop', ({ args = [], sender }) => {
    if (hasHelp(args)) { help(sender); return; }
    ctx.log?.('フォローを停止します');
    ctx.stopFollowing?.();
  });
}

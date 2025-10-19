export function register(bot, commandHandlers, ctx) {
  commandHandlers.set('come', ({ sender }) => {
    const player = bot.players[sender];
    if (player?.entity) {
      const { x, y, z } = player.entity.position;
      if (bot.pathfinder?.setGoal) {
        bot.pathfinder.setGoal(new ctx.goals.GoalNear(x, y, z, 1));
      }
    }
  });

  commandHandlers.set('follow', ({ sender }) => {
    ctx.log?.(`フォロー開始: ${sender}`);
    ctx.startFollowing?.(sender);
  });

  commandHandlers.set('stop', () => {
    ctx.log?.('フォローを停止します');
    ctx.stopFollowing?.();
  });
}


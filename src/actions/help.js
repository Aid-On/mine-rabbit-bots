export function register(bot, commandHandlers) {
  commandHandlers.set('help', ({ sender }) => {
    const lines = [
      'commands: ping, come, follow, stop, jump',
      'look <dir|player|x y z> / face',
      'fish [start|once|stop] / 釣り [start|once|stop]',
      'build <block> [front|back|left|right|up|down|near]',
      'dig <block> [count] / mine <block> [count]',
      'craft <item> [count]',
      'items|inv|inventory|list',
      'status|hp|food|ステータス|状態: 体力・満腹度を表示',
      'furnace <input|fuel|take|load> ...',
      'chest all / chest take <item> [count]',
      'ja <enName> / jaadd <英名> <日本語> / jadel <英名>',
      'jaload / jaimport data/ja-items.(json|csv)'
    ];
    for (const l of lines) bot.chat(sender ? `@${sender} ${l}` : l);
  });
}

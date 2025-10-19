export function register(bot, commandHandlers) {
  commandHandlers.set('jump', () => {
    bot.setControlState('jump', true);
    setTimeout(() => bot.setControlState('jump', false), 500);
  });
}


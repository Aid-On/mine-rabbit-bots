export function register(bot, commandHandlers) {
  commandHandlers.set('ping', () => { bot.chat('pong'); });
}


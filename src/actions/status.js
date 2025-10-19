export function register(bot, commandHandlers, ctx) {
  commandHandlers.set('status', ({ sender }) => {
    try {
      const hp = Math.max(0, Math.min(20, Number(bot.health ?? 0)));
      const hearts = (hp / 2).toFixed(1);
      const food = Math.max(0, Math.min(20, Number(bot.food ?? 0)));
      const shanks = (food / 2).toFixed(1);
      const sat = Number(bot.foodSaturation ?? 0).toFixed(1);
      const msg = `体力 ${hp}/20（${hearts} ハート）, 満腹度 ${food}/20（${shanks}）, 隠し満腹度 ${sat}`;
      bot.chat(sender ? `@${sender} ${msg}` : msg);
    } catch (e) {
      bot.chat(sender ? `@${sender} 取得失敗: ${e.message}` : `取得失敗: ${e.message}`);
    }
  });
  commandHandlers.set('hp', (ctx2) => commandHandlers.get('status')(ctx2));
  commandHandlers.set('food', (ctx2) => commandHandlers.get('status')(ctx2));
  commandHandlers.set('ステータス', (ctx2) => commandHandlers.get('status')(ctx2));
  commandHandlers.set('状態', (ctx2) => commandHandlers.get('status')(ctx2));
}


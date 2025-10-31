export function register(bot, commandHandlers) {
  const say = (msg, sender) => { try { bot.chat(sender ? `@${sender} ${msg}` : msg); } catch (_) {} };
  const sayNM = (msg) => { try { bot.chat(msg); } catch (_) {} };

  const showOverview = (_sender) => {
    sayNM('— ヘルプ —');
    sayNM('基本: ping, status, eat, fish, follow|come|stop, look, jump');
    sayNM('行動: dig, build, items');
    sayNM('生産: craft, craftauto, furnace, smeltauto, chest');
    sayNM('ユーティリティ: skin, perf, ja, jaload, jaadd, jadel, jaimport');
    sayNM('各コマンドの詳細: <cmd> -h で表示（例: fish -h）');
  };

  const showHelp = ({ args = [], sender }) => {
    // help <cmd> で個別ヘルプ（各コマンドの -h を呼ぶ）
    const q = String(args[0] || '').toLowerCase();
    if (q) {
      const handler = commandHandlers.get(q);
      if (typeof handler === 'function') {
        try { handler({ args: ['-h'], sender }); } catch (_) { showOverview(sender); }
        return;
      }
      sayNM(`不明なコマンド: ${q}`);
      showOverview(sender);
      return;
    }
    showOverview(sender);
  };

  commandHandlers.set('help', showHelp);
  // 日本語エイリアス
  commandHandlers.set('ヘルプ', (ctx) => showHelp(ctx));
  commandHandlers.set('助けて', (ctx) => showHelp(ctx));
  commandHandlers.set('コマンド', (ctx) => showHelp(ctx));
}

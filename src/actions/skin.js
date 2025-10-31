// スキン設定アクション
// 前提: サーバー側に SkinsRestorer 等のスキンプラグインが導入されていること
// 仕組み: ボットがサーバーコマンドを実行して、送信者(入場者)のスキンを設定します。

export function register(bot, commandHandlers, ctx) {
  const say = (msg, sender) => { try { if (sender) bot.chat(`@${sender} ${msg}`); else bot.chat(msg); } catch (_) {} };
  const hasHelp = (arr) => (arr || []).some(a => ['-h','--help','help','ヘルプ','/?','?'].includes(String(a||'').toLowerCase()));

  const sanitizePlayer = (s) => (s || '').replace(/[^A-Za-z0-9_\-]/g, '').slice(0, 32);
  const isPngUrl = (s) => /^https?:\/\/[^\s]+\.png(?:\?[^\s]*)?$/i.test(s || '');
  const sanitizeSkinName = (s) => (s || '').replace(/[^A-Za-z0-9_\-]/g, '').slice(0, 32);

  const runSkinSet = ({ target, skin }) => {
    const t = sanitizePlayer(target);
    if (!t) return false;
    if (isPngUrl(skin)) {
      // 多くの SkinsRestorer 環境では /skin set <player> <url> が機能します
      bot.chat(`/skin set ${t} ${skin}`);
      return true;
    }
    const name = sanitizeSkinName(skin);
    if (!name) return false;
    bot.chat(`/skin set ${t} ${name}`);
    return true;
  };

  const runSkinClear = ({ target }) => {
    const t = sanitizePlayer(target);
    if (!t) return false;
    bot.chat(`/skin clear ${t}`);
    return true;
  };

  const runSkinUpdate = ({ target }) => {
    const t = sanitizePlayer(target);
    if (!t) return false;
    bot.chat(`/skin update ${t}`);
    return true;
  };

  const skinHandler = async ({ args, sender }) => {
    if (!args?.length || hasHelp(args)) {
      bot.chat('スキン変更: 名前またはPNG URLで変更できます。');
      bot.chat('使用: skin <name|png-url>');
      bot.chat('     skin set <name|png-url>');
      bot.chat('     skin of <player> <name|png-url>');
      bot.chat('     skin clear | skin update');
      bot.chat('例: skin Steve / skin https://ex.com/a.png / skin of Alice Alex');
      return;
    }

    const sub = args[0].toLowerCase();
    // skin <name|png-url> -> 送信者のスキンを変更
    if (args.length === 1) {
      const skin = args[0];
      const ok = runSkinSet({ target: sender, skin });
      say(ok ? `スキン変更リクエスト: ${sender} -> ${skin}` : '引数が不正です', sender);
      return;
    }

    if (sub === 'set' && args[1]) {
      const skin = args[1];
      const ok = runSkinSet({ target: sender, skin });
      say(ok ? `スキン変更リクエスト: ${sender} -> ${skin}` : '引数が不正です', sender);
      return;
    }

    if (sub === 'url' && args[1]) {
      const skin = args[1];
      if (!isPngUrl(skin)) { say('png の URL を指定してください', sender); return; }
      const ok = runSkinSet({ target: sender, skin });
      say(ok ? `スキン変更リクエスト(URL): ${sender}` : '失敗しました', sender);
      return;
    }

    if (sub === 'clear') {
      const ok = runSkinClear({ target: sender });
      say(ok ? `スキンを初期化リクエスト: ${sender}` : '失敗しました', sender);
      return;
    }

    if (sub === 'update') {
      const ok = runSkinUpdate({ target: sender });
      say(ok ? `スキン更新リクエスト: ${sender}` : '失敗しました', sender);
      return;
    }

    // skin of <player> <name|png-url>
    if (sub === 'of' && args[1] && args[2]) {
      const player = args[1];
      const skin = args[2];
      const ok = runSkinSet({ target: player, skin });
      say(ok ? `スキン変更リクエスト: ${player} -> ${skin}` : '引数が不正です', sender);
      return;
    }

    // fallback: skin <name|png-url>
    const skin = args[0];
    const ok = runSkinSet({ target: sender, skin });
    say(ok ? `スキン変更リクエスト: ${sender} -> ${skin}` : '引数が不正です', sender);
  };

  commandHandlers.set('skin', skinHandler);
  // 日本語エイリアス
  commandHandlers.set('スキン', (ctx2) => skinHandler(ctx2));
}

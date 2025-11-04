import { readFile } from 'fs/promises';

export function register(bot, commandHandlers, ctx) {
  const hasHelp = (arr) => (arr || []).some(a => ['-h','--help','help','ヘルプ'].includes(String(a||'').toLowerCase()));

  commandHandlers.set('ja', ({ args, sender }) => {
    if (!args?.length || hasHelp(args)) {
      bot.chat('英名→日本語名を表示します。');
      bot.chat('使用: ja <英名>');
      bot.chat('例: ja oak_log → オークの原木');
      return;
    }
    const en = (args[0] || '').replace(/^minecraft:/, '').toLowerCase();
    bot.chat(`${en} → ${ctx.getJaItemName(en)}`);
  });

  commandHandlers.set('jaadd', ({ args, sender }) => {
    if (!args || args.length < 2 || hasHelp(args)) {
      bot.chat('日本語辞書に個別登録します。');
      bot.chat('使用: jaadd <英名> <日本語名>');
      bot.chat('例: jaadd iron_ingot 鉄インゴット');
      return;
    }
    const en = String(args[0]).replace(/^minecraft:/, '').toLowerCase();
    const ja = args.slice(1).join(' ');
    const dict = ctx.getJaDict();
    dict[en] = ja;
    ctx.saveJaDict().then((ok) => { bot.chat(`登録: ${en} → ${ja} ${ok ? '(保存済)' : '(保存失敗)'}`); });
  });

  commandHandlers.set('jadel', ({ args, sender }) => {
    if (!args?.length || hasHelp(args)) {
      bot.chat('日本語辞書から削除します。');
      bot.chat('使用: jadel <英名>');
      bot.chat('例: jadel iron_ingot');
      return; }
    const en = (args[0] || '').replace(/^minecraft:/, '').toLowerCase();
    const dict = ctx.getJaDict();
    if (dict[en]) {
      delete dict[en];
      ctx.saveJaDict().then((ok) => { bot.chat(`削除: ${en} ${ok ? '(保存済)' : '(保存失敗)'}`); });
    } else {
      bot.chat(`未登録: ${en}`);
    }
  });

  commandHandlers.set('jaload', async ({ args = [], sender }) => {
    if (hasHelp(args)) { bot.chat('日本語辞書を再読み込みします。'); bot.chat('使用: jaload'); return; }
    try { await ctx.loadJaDict(); bot.chat(`日本語辞書を再読み込みしました（${Object.keys(ctx.getJaDict()).length}件）`); }
    catch (e) { bot.chat(`失敗: ${e.message}`); }
  });

  commandHandlers.set('jaimport', async ({ args, sender }) => {
    if (!args?.length || hasHelp(args)) {
      bot.chat('日本語辞書をファイルから取り込みます。');
      bot.chat('使用: jaimport data/ja-items.csv|json');
      return; }
    const rel = args[0];
    try {
      const lower = rel.toLowerCase();
      let added = 0;
      if (lower.endsWith('.json')) {
        const buf = await readFile(new URL(`../${rel}`, import.meta.url));
        const obj = JSON.parse(String(buf));
        if (!obj || typeof obj !== 'object') throw new Error('JSONが不正です');
        const dict = ctx.getJaDict();
        for (const [k, v] of Object.entries(obj)) { if (k && v) dict[k] = v; }
        added = Object.keys(obj).length; await ctx.saveJaDict();
      } else if (lower.endsWith('.csv') || lower.endsWith('.tsv')) {
        const text = String(await readFile(new URL(`../${rel}`, import.meta.url)));
        const lines = text.split(/\r?\n/);
        let count = 0; const dict = ctx.getJaDict();
        for (const raw of lines) {
          const line = raw.trim(); if (!line || line.startsWith('#')) continue;
          const parts = line.split(/[\t,]/); if (parts.length < 2) continue;
          const en = parts[0].trim().replace(/^minecraft:/, '').toLowerCase();
          const ja = parts.slice(1).join(',').trim(); if (!en || !ja) continue;
          dict[en] = ja; count++;
        }
        await ctx.saveJaDict(); added = count;
      } else { throw new Error('拡張子は .json / .csv / .tsv を指定してください'); }
      bot.chat(`取り込み: ${rel} → ${added}件`);
    } catch (e) { bot.chat(`失敗: ${e.message}`); }
  });
}

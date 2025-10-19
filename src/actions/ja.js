import { readFile } from 'fs/promises';

export function register(bot, commandHandlers, ctx) {
  commandHandlers.set('ja', ({ args, sender }) => {
    const en = (args[0] || '').replace(/^minecraft:/, '').toLowerCase();
    if (!en) { bot.chat(sender ? `@${sender} 使用方法: ja <英名>` : 'usage: ja <enName>'); return; }
    bot.chat(sender ? `@${sender} ${en} → ${ctx.getJaItemName(en)}` : `${en} → ${ctx.getJaItemName(en)}`);
  });

  commandHandlers.set('jaadd', ({ args, sender }) => {
    if (!args || args.length < 2) { bot.chat(sender ? `@${sender} 使用方法: jaadd <英名> <日本語名>` : 'usage: jaadd <en> <ja>'); return; }
    const en = String(args[0]).replace(/^minecraft:/, '').toLowerCase();
    const ja = args.slice(1).join(' ');
    const dict = ctx.getJaDict();
    dict[en] = ja;
    ctx.saveJaDict().then((ok) => {
      bot.chat(sender ? `@${sender} 登録: ${en} → ${ja} ${ok ? '(保存済)' : '(保存失敗)'}` : `登録: ${en} → ${ja}`);
    });
  });

  commandHandlers.set('jadel', ({ args, sender }) => {
    const en = (args[0] || '').replace(/^minecraft:/, '').toLowerCase();
    if (!en) { bot.chat(sender ? `@${sender} 使用方法: jadel <英名>` : 'usage: jadel <en>'); return; }
    const dict = ctx.getJaDict();
    if (dict[en]) {
      delete dict[en];
      ctx.saveJaDict().then((ok) => {
        bot.chat(sender ? `@${sender} 削除: ${en} ${ok ? '(保存済)' : '(保存失敗)'}` : `削除: ${en}`);
      });
    } else {
      bot.chat(sender ? `@${sender} 未登録: ${en}` : `未登録: ${en}`);
    }
  });

  commandHandlers.set('jaload', async ({ sender }) => {
    try { await ctx.loadJaDict(); bot.chat(sender ? `@${sender} 日本語辞書を再読み込みしました（${Object.keys(ctx.getJaDict()).length}件）` : 'OK'); }
    catch (e) { bot.chat(sender ? `@${sender} 失敗: ${e.message}` : `失敗: ${e.message}`); }
  });

  commandHandlers.set('jaimport', async ({ args, sender }) => {
    const rel = args[0];
    if (!rel) { bot.chat(sender ? `@${sender} 使用: jaimport data/ja-items.csv|json` : 'usage: jaimport data/ja-items.csv|json'); return; }
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
      bot.chat(sender ? `@${sender} 取り込み: ${rel} → ${added}件` : `取り込み: ${added}`);
    } catch (e) { bot.chat(sender ? `@${sender} 失敗: ${e.message}` : `失敗: ${e.message}`); }
  });
}


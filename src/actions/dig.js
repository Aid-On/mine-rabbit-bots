export function register(bot, commandHandlers, ctx) {
  // dig <blockName> [count]
  commandHandlers.set('dig', ({ args, sender }) => {
    if (!args || args.length === 0) { bot.chat(sender ? `@${sender} 使用方法: dig <blockName> [count]` : 'usage: dig <blockName> [count]'); return; }
    const a0 = String(args[0]).toLowerCase();
    const a1 = args[1] !== undefined ? String(args[1]).toLowerCase() : undefined;
    const a0num = Number(a0); const a1num = a1 !== undefined ? Number(a1) : NaN;
    let blockName = isNaN(a0num) ? a0 : (a1 ?? '');
    let count = !isNaN(a0num) ? a0num : (!isNaN(a1num) ? a1num : 1);
    blockName = blockName.replace(/^minecraft:/, '').replace(/\s+/g, '_');
    count = Math.max(1, Math.min(64, Number(count)));

    (async () => {
      const mc = ctx.mcData(); if (!mc) { ctx.log?.('データ未初期化'); return; }
      const def = mc.blocksByName[blockName];
      if (!def) { ctx.log?.(`不明なブロック名: ${blockName}`); bot.chat(`@${sender} 不明なブロック名: ${blockName}`); return; }
      bot.chat(`@${sender} ${blockName} を ${count} 個掘ります`);
      let mined = 0;
      for (let i = 0; i < count; i++) {
        const [pos] = ctx.findNearestBlockByName(blockName, { maxDistance: 24, count: 1 });
        if (!pos) { ctx.log?.(`近くに ${blockName} が見つかりませんでした（進捗 ${mined}/${count}）`); bot.chat(`@${sender} 近くに ${blockName} が見つかりません`); break; }
        try { await ctx.gotoBlockAndDig(pos); mined += 1; ctx.log?.(`${blockName} を掘りました。進捗: ${mined}/${count}`); if (i % 2 === 0 && i > 0) await new Promise(r => setTimeout(r, 100)); }
        catch (err) { ctx.log?.(`掘削に失敗: ${err.message}`); bot.chat(`@${sender} 掘削に失敗: ${err.message}`); break; }
      }
      if (mined === count) bot.chat(`@${sender} 掘削完了: ${blockName} x${count}`);
    })();
  });
  commandHandlers.set('mine', (ctx2) => commandHandlers.get('dig')(ctx2));
}


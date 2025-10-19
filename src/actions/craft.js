export function register(bot, commandHandlers, ctx) {
  // craft <itemName> [count]
  commandHandlers.set('craft', ({ args, sender }) => {
    const mc = ctx.mcData();
    if (!mc) { if (sender) bot.chat(`@${sender} データ未初期化です。少し待ってください`); return; }
    if (!args || args.length === 0) { if (sender) bot.chat(`@${sender} 使用方法: craft <itemName> [count]`); return; }
    const a0 = String(args[0]).toLowerCase(); const a1 = args[1] !== undefined ? String(args[1]).toLowerCase() : undefined;
    const a0num = Number(a0); const a1num = a1 !== undefined ? Number(a1) : NaN;
    let itemName = isNaN(a0num) ? a0 : (a1 ?? '');
    let desired = !isNaN(a0num) ? a0num : (!isNaN(a1num) ? a1num : 1);
    itemName = itemName.replace(/^minecraft:/, '').replace(/\s+/g, '_'); desired = Math.max(1, Math.min(64, Number(desired)));
    const itemDef = mc.itemsByName[itemName];
    if (!itemDef) { if (sender) bot.chat(`@${sender} 不明なアイテム: ${itemName}`); return; }
    (async () => {
      try {
        const tablePos = ctx.findNearestBlockByName('crafting_table', { maxDistance: 12, count: 1 })[0];
        let tableBlock = null; if (tablePos && tablePos.distanceTo(bot.entity.position) <= 5.5) tableBlock = bot.blockAt(tablePos);
        let recipe = bot.recipesFor(itemDef.id, null, desired, tableBlock)[0];
        if (!recipe && tableBlock) recipe = bot.recipesFor(itemDef.id, null, desired, null)[0];
        if (!recipe) { if (sender) bot.chat(`@${sender} クラフト不可（材料不足か作業台が遠い）`); return; }
        const per = recipe.result?.count || 1; const times = Math.max(1, Math.ceil(desired / per));
        if (sender) bot.chat(`@${sender} ${itemName} を ${desired} 個クラフトします`);
        let made = 0;
        for (let i = 0; i < times; i++) { try { await bot.craft(recipe, 1, recipe.requiresTable ? (tableBlock || null) : null); made += per; } catch { break; } }
        if (made > 0) { const finalCount = Math.min(made, desired); if (sender) bot.chat(`@${sender} クラフト完了: ${itemName} x${finalCount}`); }
        else { if (sender) bot.chat(`@${sender} クラフトできませんでした`); }
      } catch (e) { if (sender) bot.chat(`@${sender} エラー: ${e.message}`); }
    })();
  });

  // craft+ / craftauto <itemName> [count]
  commandHandlers.set('craft+', ({ args, sender }) => commandHandlers.get('craftauto')({ args, sender }));
  commandHandlers.set('craftauto', ({ args, sender }) => {
    const mc = ctx.mcData(); if (!mc) { if (sender) bot.chat(`@${sender} データ未初期化です。少し待ってください`); return; }
    if (!args || args.length === 0) { if (sender) bot.chat(`@${sender} 使用方法: craftauto <itemName> [count]`); return; }
    const a0 = String(args[0]).toLowerCase(); const a1 = args[1] !== undefined ? String(args[1]).toLowerCase() : undefined;
    const a0num = Number(a0); const a1num = a1 !== undefined ? Number(a1) : NaN;
    let itemName = isNaN(a0num) ? a0 : (a1 ?? ''); let desired = !isNaN(a0num) ? a0num : (!isNaN(a1num) ? a1num : 1);
    itemName = itemName.replace(/^minecraft:/, '').replace(/\s+/g, '_'); desired = Math.max(1, Math.min(64, Number(desired)));
    const itemDef = mc.itemsByName[itemName]; if (!itemDef) { if (sender) bot.chat(`@${sender} 不明なアイテム: ${itemName}`); return; }
    (async () => { try { if (sender) bot.chat(`@${sender} 自動採集つきクラフト: ${itemName} x${desired}`); const ok = await ctx.craftWithAuto(itemDef.id, desired, sender, 0); if (ok) { if (sender) bot.chat(`@${sender} クラフト完了: ${itemName} x${desired}`); } else { if (sender) bot.chat(`@${sender} 作れませんでした: ${itemName}`); } } catch(e){ if (sender) bot.chat(`@${sender} 失敗: ${e.message}`);} })();
  });
}


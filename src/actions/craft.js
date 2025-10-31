export function register(bot, commandHandlers, ctx) {
  // craft <itemName> [count]
  commandHandlers.set('craft', ({ args, sender }) => {
    const help = () => {
      bot.chat('クラフト: 指定アイテムを作成します。');
      bot.chat('使用: craft <itemName> [count]');
      bot.chat('例: craft torch 16 / craft oak_planks 32');
    };
    const hasHelp = (arr) => (arr || []).some(a => ['-h','--help','help','ヘルプ'].includes(String(a||'').toLowerCase()));
    const mc = ctx.mcData();
    if (!mc) {
      if (sender) bot.chat(`@${sender} データ未初期化です。少し待ってください`);
      return;
    }

    if (!args || args.length === 0 || hasHelp(args)) { help(); return; }

    // 引数解析: 数値が先でも後でも対応
    const a0 = String(args[0]).toLowerCase();
    const a1 = args[1] !== undefined ? String(args[1]).toLowerCase() : undefined;
    const a0num = Number(a0);
    const a1num = a1 !== undefined ? Number(a1) : NaN;

    let itemName = isNaN(a0num) ? a0 : (a1 ?? '');
    let desired = !isNaN(a0num) ? a0num : (!isNaN(a1num) ? a1num : 1);

    itemName = itemName.replace(/^minecraft:/, '').replace(/\s+/g, '_');
    desired = Math.max(1, Math.min(64, Number(desired)));

    const itemDef = mc.itemsByName[itemName];
    if (!itemDef) {
      if (sender) bot.chat(`@${sender} 不明なアイテム: ${itemName}`);
      return;
    }

    (async () => {
      try {
        // 作業台を探す
        const tablePos = ctx.findNearestBlockByName('crafting_table', { maxDistance: 12, count: 1 })[0];
        let tableBlock = null;
        if (tablePos && tablePos.distanceTo(bot.entity.position) <= 5.5) {
          tableBlock = bot.blockAt(tablePos);
        }

        // レシピを検索
        let recipe = bot.recipesFor(itemDef.id, null, desired, tableBlock)[0];
        if (!recipe && tableBlock) {
          recipe = bot.recipesFor(itemDef.id, null, desired, null)[0];
        }

        if (!recipe) {
          if (sender) bot.chat(`@${sender} クラフト不可（材料不足か作業台が遠い）`);
          return;
        }

        const per = recipe.result?.count || 1;
        const times = Math.max(1, Math.ceil(desired / per));

        if (sender) bot.chat(`@${sender} ${ctx.getJaItemName(itemName)} を ${desired} 個クラフトします`);

        let made = 0;
        for (let i = 0; i < times; i++) {
          try {
            await bot.craft(recipe, 1, recipe.requiresTable ? (tableBlock || null) : null);
            made += per;
          } catch (err) {
            ctx.log?.(`クラフトに失敗: ${err.message}`);
            break;
          }
        }

        if (made > 0) {
          const finalCount = Math.min(made, desired);
          if (sender) bot.chat(`@${sender} クラフト完了: ${ctx.getJaItemName(itemName)} x${finalCount}`);
        } else {
          if (sender) bot.chat(`@${sender} クラフトできませんでした`);
        }
      } catch (e) {
        if (sender) bot.chat(`@${sender} エラー: ${e.message}`);
      }
    })();
  });

  // craft+ / craftauto <itemName> [count]
  commandHandlers.set('craft+', ({ args, sender }) => commandHandlers.get('craftauto')({ args, sender }));

  commandHandlers.set('craftauto', ({ args, sender }) => {
    const help = () => {
      bot.chat('自動採集つきクラフト: 足りない素材を集めて作成します。');
      bot.chat('使用: craftauto <itemName> [count]');
      bot.chat('例: craftauto torch 32');
    };
    const hasHelp = (arr) => (arr || []).some(a => ['-h','--help','help','ヘルプ'].includes(String(a||'').toLowerCase()));
    const mc = ctx.mcData();
    if (!mc) {
      if (sender) bot.chat(`@${sender} データ未初期化です。少し待ってください`);
      return;
    }

    if (!args || args.length === 0 || hasHelp(args)) { help(); return; }

    // 引数解析: 数値が先でも後でも対応
    const a0 = String(args[0]).toLowerCase();
    const a1 = args[1] !== undefined ? String(args[1]).toLowerCase() : undefined;
    const a0num = Number(a0);
    const a1num = a1 !== undefined ? Number(a1) : NaN;

    let itemName = isNaN(a0num) ? a0 : (a1 ?? '');
    let desired = !isNaN(a0num) ? a0num : (!isNaN(a1num) ? a1num : 1);

    itemName = itemName.replace(/^minecraft:/, '').replace(/\s+/g, '_');
    desired = Math.max(1, Math.min(64, Number(desired)));

    const itemDef = mc.itemsByName[itemName];
    if (!itemDef) {
      if (sender) bot.chat(`@${sender} 不明なアイテム: ${itemName}`);
      return;
    }

    (async () => {
      try {
        if (sender) bot.chat(`@${sender} 自動採集つきクラフト: ${ctx.getJaItemName(itemName)} x${desired}`);
        const ok = await ctx.craftWithAuto(itemDef.id, desired, sender, 0);

        if (ok) {
          if (sender) bot.chat(`@${sender} クラフト完了: ${ctx.getJaItemName(itemName)} x${desired}`);
        } else {
          if (sender) bot.chat(`@${sender} 作れませんでした: ${ctx.getJaItemName(itemName)}`);
        }
      } catch (e) {
        if (sender) bot.chat(`@${sender} 失敗: ${e.message}`);
      }
    })();
  });
}

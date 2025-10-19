// Crafting-related helpers extracted from bot.js

export const craftWithAuto = async (bot, mcData, deps, itemId, desiredCount, sender, depth = 0) => {
  const { invCountById, itemNameById, getJaItemName, findNearestBlockByName, gotoBlock, smeltAuto, gatherItemByMining } = deps;
  if (depth > 4) throw new Error('依存が深すぎます');
  if (invCountById(itemId, null) >= desiredCount) return true;

  const tablePos = findNearestBlockByName('crafting_table', { maxDistance: 12, count: 1 })[0];
  const tableBlock = tablePos ? bot.blockAt(tablePos) : null;

  const allCandidates = [
    ...bot.recipesAll(itemId, null, null),
    ...(tableBlock ? bot.recipesAll(itemId, null, tableBlock) : [])
  ];
  if (allCandidates.length === 0) throw new Error('レシピがありません');
  const recipe = allCandidates.find((r) => !r.requiresTable) || allCandidates[0];

  const once = recipe.result?.count || 1;
  const times = Math.max(1, Math.ceil(desiredCount / once));
  for (const d of recipe.delta) {
    if (d.count >= 0) continue;
    const needTotal = -(d.count) * times;
    const needName = itemNameById(d.id);
    let guard = 0;
    while (invCountById(d.id, d.metadata) < needTotal) {
      if (++guard > 8) throw new Error(`材料の確保に失敗: ${getJaItemName(needName)}`);
      const have = invCountById(d.id, d.metadata);
      const missing = Math.max(0, needTotal - have);
      const subRecipes = [
        ...bot.recipesAll(d.id, d.metadata ?? null, null),
        ...(tableBlock ? bot.recipesAll(d.id, d.metadata ?? null, tableBlock) : [])
      ];
      if (subRecipes.length > 0) {
        if (sender) bot.chat(`@${sender} 材料不足: ${getJaItemName(needName)} x${missing} → 作成試行`);
        const ok = await craftWithAuto(bot, mcData, deps, d.id, needTotal, sender, depth + 1);
        if (!ok) throw new Error(`材料作成に失敗: ${getJaItemName(needName)}`);
        continue;
      }
      const outKey = mcData.items[d.id]?.name;
      if (outKey && deps.smeltSources?.[outKey]) {
        if (sender) bot.chat(`@${sender} 材料不足: ${getJaItemName(outKey)} x${missing} → 製錬`);
        const made = await smeltAuto(outKey, missing, sender);
        if (made <= 0) throw new Error(`製錬に失敗: ${getJaItemName(outKey)}`);
        continue;
      }
      try {
        if (sender) bot.chat(`@${sender} 材料採集: ${getJaItemName(needName)} x${missing}`);
        const got = await gatherItemByMining(needName, missing);
        if (got <= 0) throw new Error(`採集できませんでした: ${getJaItemName(needName)}`);
      } catch (e) {
        throw new Error(e.message || `採集失敗: ${getJaItemName(needName)}`);
      }
    }
  }

  if (recipe.requiresTable && tablePos) await gotoBlock(tablePos);
  for (let i = 0; i < times; i++) {
    await bot.craft(recipe, 1, recipe.requiresTable ? (tableBlock || null) : null);
  }
  return invCountById(itemId, null) >= desiredCount;
};


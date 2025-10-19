// Furnace-related helpers extracted from bot.js
// All functions are stateless and expect required dependencies to be passed in.

export const smeltSources = {
  iron_ingot: ['raw_iron'],
  gold_ingot: ['raw_gold'],
  copper_ingot: ['raw_copper'],
  glass: ['sand', 'red_sand'],
  smooth_stone: ['stone'],
  brick: ['clay_ball'],
  dried_kelp: ['kelp'],
  charcoal: ['oak_log', 'birch_log', 'spruce_log', 'jungle_log', 'acacia_log', 'dark_oak_log', 'mangrove_log', 'cherry_log']
};

export const openOrApproachFurnace = async (bot, mcData, gotoBlock) => {
  const ids = [];
  const add = (n) => { const b = mcData?.blocksByName?.[n]; if (b) ids.push(b.id); };
  add('furnace'); add('lit_furnace');
  const findNearest = (maxDistance) => ids.length ? bot.findBlock({ matching: ids, maxDistance }) : null;
  let block = findNearest(6);
  if (!block) {
    block = findNearest(48);
    if (block && gotoBlock) await gotoBlock(block.position);
  }
  if (!block) throw new Error('近くにかまどが見つかりません');
  return await bot.openFurnace(block);
};

export const ensureFuelInFurnace = async (bot, mcData, { invCountById, gatherItemByMining }, furnace, itemsToSmelt, sender) => {
  const units = Math.max(1, Math.ceil(itemsToSmelt / 8));
  const tryPut = async (name, needUnits) => {
    const def = mcData.itemsByName[name];
    if (!def) return 0;
    const have = invCountById(def.id, null);
    if (have <= 0) return 0;
    const put = Math.min(needUnits, have);
    await furnace.putFuel(def.id, null, put);
    return put;
  };

  let remaining = units;
  remaining -= await tryPut('coal', remaining);
  if (remaining > 0) remaining -= await tryPut('charcoal', remaining);

  if (remaining > 0) {
    if (sender) bot.chat(`@${sender} 燃料不足: 石炭 x${remaining} を採集`);
    const got = await gatherItemByMining('coal', remaining);
    if (got > 0) remaining -= await tryPut('coal', got);
  }
  if (remaining > 0) throw new Error('燃料不足');
};

export const smeltAuto = async (bot, mcData, deps, outputName, desiredCount, sender) => {
  const { invCountById, invCountByName, gatherSources, gatherItemByMining, openOrApproachFurnace, ensureFuelInFurnace, getJaItemName } = deps;
  outputName = outputName.replace(/^minecraft:/, '').toLowerCase();
  const outDef = mcData.itemsByName[outputName];
  if (!outDef) throw new Error(`未知のアイテム: ${outputName}`);
  const have = invCountById(outDef.id, null);
  if (have >= desiredCount) return 0;
  let remain = desiredCount - have;

  const inputs = smeltSources[outputName] || [];
  if (inputs.length === 0) throw new Error(`自動製錬非対応: ${outputName}`);

  let inputName = inputs.find((n) => invCountByName(n) > 0) || null;
  if (!inputName) {
    const candidate = inputs.find((n) => gatherSources()[n]);
    if (candidate) {
      if (sender) bot.chat(`@${sender} 材料採集（製錬用）: ${getJaItemName(candidate)} x${remain}`);
      await gatherItemByMining(candidate, remain);
      inputName = candidate;
    }
  }
  if (!inputName) throw new Error('材料がありません');

  const inDef = mcData.itemsByName[inputName];
  let inHave = invCountById(inDef.id, null);
  if (inHave <= 0) throw new Error('材料がありません');

  const furnace = await openOrApproachFurnace();
  const toSmelt = Math.min(inHave, remain);
  await ensureFuelInFurnace(furnace, toSmelt, sender);
  await furnace.putInput(inDef.id, null, toSmelt);
  if (sender) bot.chat(`@${sender} 製錬開始: ${getJaItemName(inputName)} → ${getJaItemName(outputName)} x${toSmelt}`);

  let made = 0;
  const start = Date.now();
  const timeoutMs = 120000;
  try {
    while (made < toSmelt && Date.now() - start < timeoutMs) {
      await new Promise((res) => setTimeout(res, 2000));
      const out = furnace.outputItem();
      if (out && out.type === outDef.id) {
        const got = await furnace.takeOutput();
        made += got?.count || 0;
      }
    }
  } finally {
    furnace.close();
  }
  return made;
};


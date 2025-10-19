// Gathering helpers (mining sources)

export function gatherSources(mcData) {
  const b = mcData?.blocksByName || {};
  const ids = (names) => names.map((n) => b[n]?.id).filter(Boolean);
  return {
    oak_log: ids(['oak_log', 'birch_log', 'spruce_log', 'jungle_log', 'acacia_log', 'dark_oak_log', 'mangrove_log', 'cherry_log']),
    cobblestone: ids(['cobblestone', 'stone']),
    sand: ids(['sand', 'red_sand']),
    coal: ids(['coal_ore', 'deepslate_coal_ore']),
    raw_iron: ids(['iron_ore', 'deepslate_iron_ore']),
    raw_gold: ids(['gold_ore', 'deepslate_gold_ore']),
    raw_copper: ids(['copper_ore', 'deepslate_copper_ore']),
    clay_ball: ids(['clay']),
    kelp: ids(['kelp'])
  };
}

export async function gatherItemByMining(bot, mcData, findNearestBlocksByIds, gotoBlockAndDig, itemName, desiredCount, opts = {}) {
  const sources = gatherSources(mcData);
  const ids = sources[itemName];
  if (!ids || ids.length === 0) throw new Error(`自動採集非対応: ${itemName}`);

  let obtained = 0;
  const maxLoops = Math.max(desiredCount * 2, desiredCount + 1);
  for (let i = 0; i < maxLoops && obtained < desiredCount; i++) {
    const [pos] = findNearestBlocksByIds(ids, { maxDistance: opts.maxDistance || 32, count: 1 });
    if (!pos) break;
    try {
      await gotoBlockAndDig(pos);
      obtained += 1;
      if (i % 3 === 0) await new Promise(resolve => setTimeout(resolve, 50));
    } catch (e) {
      break;
    }
  }
  return obtained;
}

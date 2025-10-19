import { sleep } from './utils.js';

export const chestBlockIds = (mcData) => {
  if (!mcData) return [];
  const ids = [];
  const add = (n) => { const b = mcData.blocksByName[n]; if (b) ids.push(b.id); };
  add('chest'); add('trapped_chest');
  return ids;
};

export const findNearestChest = (bot, mcData, maxDistance = 6) => {
  const ids = chestBlockIds(mcData);
  if (ids.length === 0) return null;
  return bot.findBlock({ matching: ids, maxDistance });
};

export const openNearestChest = async (bot, mcData, gotoBlock, { near = 6, far = 48 } = {}) => {
  let block = findNearestChest(bot, mcData, near);
  if (!block) {
    block = findNearestChest(bot, mcData, far);
    if (block && gotoBlock) await gotoBlock(block.position);
  }
  if (!block) throw new Error('近くにチェストが見つかりません');
  const chest = await bot.openChest(block);
  await sleep(200);
  return chest;
};


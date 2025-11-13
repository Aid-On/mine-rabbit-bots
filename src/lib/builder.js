/**
 * 建築機能
 * .json ファイルから建築を行う
 */
import { readFile } from 'fs/promises';
import { Vec3 } from 'vec3';

/**
 * .json ファイルを読み込む
 * @param {Object} bot - mineflayer bot
 * @param {string} filePath - 設計書ファイルのパス
 * @returns {Promise<Object>} schematic データ
 */
export async function loadSchematic(bot, filePath) {
  try {
    const fileData = await readFile(filePath);
    const json = JSON.parse(fileData.toString());
    return { type: 'json', data: json };
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`設計書ファイルが見つかりません: ${filePath}`);
    }
    console.error('loadSchematic error:', error);
    throw error;
  }
}

/**
 * schematic から必要な材料をリストアップ
 * @param {Object} schematic - schematic データ
 * @param {Object} mcData - minecraft-data
 * @returns {Object} ブロック名と数量のマップ
 */
export function getMaterialsFromSchematic(schematic, mcData) {
  const materials = {};

  if (!schematic || schematic.type !== 'json') {
    return materials;
  }

  const blocks = schematic.data.blocks.filter(b => b.block);
  for (const block of blocks) {
    materials[block.block] = (materials[block.block] || 0) + 1;
  }

  return materials;
}

/**
 * 必要な材料が揃っているかチェック
 * @param {Object} bot - mineflayer bot
 * @param {Object} materials - 必要な材料 { blockName: count }
 * @returns {Object} { hasAll: boolean, missing: Object, available: Object }
 */
export function checkMaterials(bot, materials) {
  const missing = {};
  const available = {};
  let hasAll = true;

  for (const [blockName, required] of Object.entries(materials)) {
    const count = bot.inventory.items()
      .filter(item => item.name === blockName)
      .reduce((sum, item) => sum + item.count, 0);

    available[blockName] = count;

    if (count < required) {
      missing[blockName] = required - count;
      hasAll = false;
    }
  }

  return { hasAll, missing, available };
}

/**
 * schematic を指定位置に建築（手動実装）
 * @param {Object} bot - mineflayer bot
 * @param {Object} schematic - schematic データ
 * @param {Vec3} position - 建築開始位置
 * @param {Object} ctx - コンテキスト
 * @param {Object} options - オプション { facing: string, onProgress: Function }
 * @returns {Promise<void>}
 */
export async function buildSchematic(bot, schematic, position, ctx, options = {}) {
  if (schematic.type !== 'json') {
    throw new Error('現在はJSON形式のみ対応しています');
  }

  const data = schematic.data;
  const blocks = [];

  for (const block of data.blocks) {
    if (!block.block) continue;

    const worldPos = position.offset(block.x, block.y, block.z);
    blocks.push({
      x: worldPos.x,
      y: worldPos.y,
      z: worldPos.z,
      name: block.block
    });
  }

  // 下から上へソート
  blocks.sort((a, b) => {
    if (a.y !== b.y) return a.y - b.y;
    return 0;
  });

  let placed = 0;
  const total = blocks.length;

  for (const blockInfo of blocks) {
    try {
      const targetPos = new Vec3(blockInfo.x, blockInfo.y, blockInfo.z);

      // アイテムを装備
      const item = bot.inventory.items().find(i => i.name === blockInfo.name);
      if (!item) {
        ctx.log?.(`${blockInfo.name} が不足 (スキップ)`);
        placed++;
        if (options.onProgress) options.onProgress(placed, total);
        continue;
      }

      // すでにブロックがある場合はスキップ
      const existingBlock = bot.blockAt(targetPos);
      if (existingBlock && existingBlock.name !== 'air') {
        placed++;
        if (options.onProgress) options.onProgress(placed, total);
        continue;
      }

      // 参照ブロックを探す
      const ref = ctx.findPlaceRefForTarget(targetPos);
      if (!ref) {
        placed++;
        if (options.onProgress) options.onProgress(placed, total);
        continue;
      }

      // ブロックの近くまで移動
      const distance = bot.entity.position.distanceTo(targetPos);
      if (distance > 4) {
        try {
          await ctx.gotoBlock(targetPos);
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (moveError) {
          // 移動失敗してもスキップ
          placed++;
          if (options.onProgress) options.onProgress(placed, total);
          continue;
        }
      }

      // ブロックを設置
      await bot.equip(item, 'hand');
      bot.setControlState('sneak', true);

      try {
        await bot.placeBlock(ref.refBlock, ref.face);
        placed++;
        if (options.onProgress) options.onProgress(placed, total);
        await new Promise(resolve => setTimeout(resolve, 150));
      } catch (placeError) {
        placed++;
        if (options.onProgress) options.onProgress(placed, total);
      } finally {
        bot.setControlState('sneak', false);
      }

    } catch (error) {
      placed++;
      if (options.onProgress) options.onProgress(placed, total);
    }
  }

  return placed;
}

/**
 * schematic の情報を取得
 * @param {Object} schematic - schematic データ
 * @returns {Object} { size: Vec3, blockCount: number }
 */
export function getSchematicInfo(schematic) {
  if (!schematic || schematic.type !== 'json') {
    return { size: new Vec3(0, 0, 0), blockCount: 0 };
  }

  const data = schematic.data;
  const size = new Vec3(data.size.x, data.size.y, data.size.z);
  const blockCount = data.blocks.filter(b => b.block).length;

  return { size, blockCount };
}

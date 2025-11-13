/**
 * prismarine-schematic を使った建築機能
 * .schematic ファイルから建築を行う
 */
import { readFile } from 'fs/promises';
import { Vec3 } from 'vec3';
import { Schematic } from 'prismarine-schematic';

/**
 * .schematic ファイルを読み込む
 * prismarine-schematic を使用
 * @param {Object} bot - mineflayer bot
 * @param {string} filePath - .schematic ファイルのパス
 * @returns {Promise<Object>} schematic データ
 */
export async function loadSchematic(bot, filePath) {
  try {
    const fileData = await readFile(filePath);
    const schematic = await Schematic.read(fileData, bot.version);
    return schematic;
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`設計書ファイルが見つかりません: ${filePath}`);
    }
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

  if (!schematic) {
    return materials;
  }

  const size = schematic.size();

  for (let y = 0; y < size.y; y++) {
    for (let z = 0; z < size.z; z++) {
      for (let x = 0; x < size.x; x++) {
        const block = schematic.getBlock(new Vec3(x, y, z));
        if (!block || block.name === 'air') continue;

        materials[block.name] = (materials[block.name] || 0) + 1;
      }
    }
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
  const size = schematic.size();
  const blocks = [];

  // schematicから全ブロックを取得
  for (let y = 0; y < size.y; y++) {
    for (let z = 0; z < size.z; z++) {
      for (let x = 0; x < size.x; x++) {
        const block = schematic.getBlock(new Vec3(x, y, z));
        if (!block || block.name === 'air') continue;

        const worldPos = position.offset(x, y, z);
        blocks.push({
          x: worldPos.x,
          y: worldPos.y,
          z: worldPos.z,
          name: block.name
        });
      }
    }
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
        throw new Error(`${blockInfo.name} が不足しています`);
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
        ctx.log?.(`${targetPos} に設置できません: 参照ブロックが見つかりません`);
        placed++;
        if (options.onProgress) options.onProgress(placed, total);
        continue;
      }

      // ブロックを設置
      await bot.equip(item, 'hand');
      bot.setControlState('sneak', true);

      try {
        await bot.placeBlock(ref.refBlock, ref.face);
        placed++;
        if (options.onProgress) options.onProgress(placed, total);
        await new Promise(resolve => setTimeout(resolve, 100));
      } finally {
        bot.setControlState('sneak', false);
      }

    } catch (error) {
      ctx.log?.(`ブロック配置エラー: ${error.message}`);
      throw error;
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
  if (!schematic) {
    return { size: new Vec3(0, 0, 0), blockCount: 0 };
  }

  const size = schematic.size();
  let blockCount = 0;

  for (let y = 0; y < size.y; y++) {
    for (let z = 0; z < size.z; z++) {
      for (let x = 0; x < size.x; x++) {
        const block = schematic.getBlock(new Vec3(x, y, z));
        if (block && block.name !== 'air') blockCount++;
      }
    }
  }

  return { size, blockCount };
}

/**
 * 建築機能
 * mineflayer-schem / .json ファイルから建築を行う
 */
import { readFile } from 'fs/promises';
import { Vec3 } from 'vec3';
import { Schematic } from 'prismarine-schematic';
import { Build } from 'mineflayer-schem';

/**
 * .schematic / .json ファイルを読み込む
 * @param {Object} bot - mineflayer bot
 * @param {string} filePath - 設計書ファイルのパス
 * @returns {Promise<Object>} schematic データ
 */
export async function loadSchematic(bot, filePath) {
  try {
    const fileData = await readFile(filePath);

    // JSON形式かチェック
    if (filePath.endsWith('.json')) {
      const json = JSON.parse(fileData.toString());
      return { type: 'json', data: json };
    }

    // .schem形式
    const schematic = await Schematic.read(fileData, bot.version);
    return { type: 'schem', data: schematic };
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

  if (!schematic) {
    return materials;
  }

  try {
    // JSON形式
    if (schematic.type === 'json') {
      const blocks = schematic.data.blocks.filter(b => b.block);
      for (const block of blocks) {
        materials[block.block] = (materials[block.block] || 0) + 1;
      }
      return materials;
    }

    // .schem形式
    const start = schematic.data.start();
    const end = schematic.data.end();

    for (let y = start.y; y < end.y; y++) {
      for (let z = start.z; z < end.z; z++) {
        for (let x = start.x; x < end.x; x++) {
          const pos = new Vec3(x, y, z);
          const block = schematic.data.getBlock(pos);

          if (!block || block.name === 'air' || !block.name) continue;

          materials[block.name] = (materials[block.name] || 0) + 1;
        }
      }
    }
  } catch (error) {
    console.error('getMaterialsFromSchematic error:', error);
    throw new Error(`材料計算に失敗: ${error.message}`);
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
  // JSON形式の場合は手動実装（後方互換）
  if (schematic.type === 'json') {
    return await buildJsonFormat(bot, schematic.data, position, ctx, options);
  }

  // .schem形式はmineflayer-schemに任せる
  try {
    if (!bot.builder) {
      throw new Error('mineflayer-schemプラグインがロードされていません');
    }

    const build = new Build(schematic.data, bot.world, position);

    const buildOptions = {
      buildSpeed: 1.0,
      onError: 'continue', // エラーが出ても続行
      retryCount: 2,
      useNearestChest: false,
      bots: [bot]
    };

    await bot.builder.build(build, buildOptions);

    return build.blocksPlaced || 0;
  } catch (error) {
    ctx.log?.(`建築エラー: ${error.message}`);
    throw error;
  }
}

/**
 * JSON形式の建築（手動実装）
 */
async function buildJsonFormat(bot, data, position, ctx, options) {
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
  if (!schematic) {
    return { size: new Vec3(0, 0, 0), blockCount: 0 };
  }

  try {
    // JSON形式
    if (schematic.type === 'json') {
      const data = schematic.data;
      const size = new Vec3(data.size.x, data.size.y, data.size.z);
      const blockCount = data.blocks.filter(b => b.block).length;
      return { size, blockCount };
    }

    // .schem形式
    const start = schematic.data.start();
    const end = schematic.data.end();
    const size = end.minus(start);

    let blockCount = 0;

    for (let y = start.y; y < end.y; y++) {
      for (let z = start.z; z < end.z; z++) {
        for (let x = start.x; x < end.x; x++) {
          const pos = new Vec3(x, y, z);
          const block = schematic.data.getBlock(pos);

          if (block && block.name !== 'air' && block.name) blockCount++;
        }
      }
    }

    return { size, blockCount };
  } catch (error) {
    console.error('getSchematicInfo error:', error);
    throw new Error(`設計書情報の取得に失敗: ${error.message}`);
  }
}

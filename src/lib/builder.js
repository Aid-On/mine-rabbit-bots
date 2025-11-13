/**
 * prismarine-schematic を使った建築機能
 * .schematic / .litematic ファイルから建築を行う
 */
import { readFile } from 'fs/promises';
import { Vec3 } from 'vec3';
import { Schematic } from 'prismarine-schematic';

/**
 * .schematic / .litematic ファイルを読み込む
 * prismarine-schematic を使用
 * @param {Object} bot - mineflayer bot
 * @param {string} filePath - .schematic / .litematic ファイルのパス
 * @returns {Promise<Object>} schematic データ
 */
export async function loadSchematic(bot, filePath) {
  try {
    const fileData = await readFile(filePath);
    const schematic = await Schematic.read(fileData, bot.version);

    // デバッグ: schematicオブジェクトの構造を確認
    console.log('Schematic loaded, type:', typeof schematic);
    console.log('Schematic methods:', Object.getOwnPropertyNames(Object.getPrototypeOf(schematic)));
    console.log('Schematic keys:', Object.keys(schematic));

    return schematic;
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
    // forEachメソッドを使用（prismarine-schematic推奨）
    schematic.forEach((block, pos) => {
      if (!block || block.name === 'air') return;
      materials[block.name] = (materials[block.name] || 0) + 1;
    });
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
  const blocks = [];

  // forEachメソッドを使用してブロック取得
  try {
    schematic.forEach((block, pos) => {
      if (!block || block.name === 'air') return;

      const worldPos = position.offset(pos.x, pos.y, pos.z);
      blocks.push({
        x: worldPos.x,
        y: worldPos.y,
        z: worldPos.z,
        name: block.name
      });
    });
  } catch (error) {
    console.error('buildSchematic forEach error:', error);
    throw new Error(`ブロック取得に失敗: ${error.message}`);
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

  try {
    // start()とend()を使ってサイズを計算
    const start = schematic.start();
    const end = schematic.end();
    const size = end.minus(start);

    console.log('Schematic start:', start);
    console.log('Schematic end:', end);
    console.log('Schematic size:', size);
    console.log('Has forEach?', typeof schematic.forEach);

    let blockCount = 0;
    let airCount = 0;
    let totalCalled = 0;

    schematic.forEach((block, pos) => {
      totalCalled++;
      if (block && block.name !== 'air') {
        blockCount++;
      } else {
        airCount++;
      }
    });

    console.log('forEach called:', totalCalled, 'times');
    console.log('Block count:', blockCount);
    console.log('Air count:', airCount);

    return { size, blockCount };
  } catch (error) {
    console.error('getSchematicInfo error:', error);
    throw new Error(`設計書情報の取得に失敗: ${error.message}`);
  }
}

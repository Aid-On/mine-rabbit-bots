/**
 * mineflayer-builder を使った建築機能
 * .schematic ファイルから建築を行う
 */
import { readFile } from 'fs/promises';
import { Vec3 } from 'vec3';

/**
 * .schematic ファイルを読み込む
 * mineflayer-builder の loadSchematic を使用
 * @param {Object} bot - mineflayer bot
 * @param {string} filePath - .schematic ファイルのパス
 * @returns {Promise<Object>} schematic データ
 */
export async function loadSchematic(bot, filePath) {
  try {
    if (!bot.builder || typeof bot.builder.loadSchematic !== 'function') {
      throw new Error('mineflayer-builder プラグインがロードされていません');
    }

    const schematic = await bot.builder.loadSchematic(filePath);
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
 * @returns {Object} ブロック名と数量のマップ
 */
export function getMaterialsFromSchematic(schematic) {
  const materials = {};

  if (!schematic || !schematic.blocks) {
    return materials;
  }

  for (const block of schematic.blocks) {
    if (!block || !block.name || block.name === 'air') continue;

    const blockName = block.name;
    materials[blockName] = (materials[blockName] || 0) + 1;
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
 * schematic を指定位置に建築
 * @param {Object} bot - mineflayer bot
 * @param {Object} schematic - schematic データ
 * @param {Vec3} position - 建築開始位置
 * @param {Object} options - オプション { facing: string }
 * @returns {Promise<void>}
 */
export async function buildSchematic(bot, schematic, position, options = {}) {
  if (!bot.builder || typeof bot.builder.build !== 'function') {
    throw new Error('mineflayer-builder プラグインがロードされていません');
  }

  // facing: 'north', 'south', 'east', 'west'
  const facing = options.facing || 'north';

  try {
    await bot.builder.build(schematic, position, { facing });
  } catch (error) {
    throw new Error(`建築エラー: ${error.message}`);
  }
}

/**
 * 建築の進捗を監視
 * @param {Object} bot - mineflayer bot
 * @param {Function} onProgress - 進捗コールバック (placed, total)
 */
export function watchBuildProgress(bot, onProgress) {
  if (!bot.builder) return null;

  const handler = (data) => {
    if (onProgress && data) {
      onProgress(data.placed || 0, data.total || 0);
    }
  };

  // イベントハンドラを登録
  bot.on('builder_progress', handler);

  // クリーンアップ関数を返す
  return () => {
    bot.removeListener('builder_progress', handler);
  };
}

/**
 * 建築をキャンセル
 * @param {Object} bot - mineflayer bot
 */
export function cancelBuild(bot) {
  if (bot.builder && typeof bot.builder.stop === 'function') {
    bot.builder.stop();
  }
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

  const size = new Vec3(
    schematic.width || 0,
    schematic.height || 0,
    schematic.length || 0
  );

  const blockCount = schematic.blocks ? schematic.blocks.filter(b => b && b.name !== 'air').length : 0;

  return { size, blockCount };
}

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
  const shouldCancel = typeof options.shouldCancel === 'function' ? options.shouldCancel : () => false;
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

  const posKey = (p) => `${p.x},${p.y},${p.z}`;
  const plannedSet = new Set(blocks.map(b => `${b.x},${b.y},${b.z}`));
  // マルチブロック（ドア上部など）で設計上は暗黙に必要になる座標をホワイトリスト
  const plannedExtraSet = new Set();
  for (const b of blocks) {
    try {
      const name = String(b.name || '').toLowerCase();
      if (name.endsWith('_door')) {
        plannedExtraSet.add(`${b.x},${b.y+1},${b.z}`);
      }
    } catch (_) {}
  }

  // 設置したスライム足場を記録
  const scaffoldList = [];

  // 指定したブロック名が確実に手に持たれているかを確認して装備
  const ensureHeldItem = async (blockName) => {
    const tryEquip = async () => {
      const it = bot.inventory.items().find(i => i.name === blockName);
      if (!it) return false;
      try { await bot.equip(it, 'hand'); } catch (_) { return false; }
      await new Promise(r => setTimeout(r, 50));
      return bot.heldItem && bot.heldItem.name === blockName;
    };
    if (await tryEquip()) return true;
    // リトライ1回
    await new Promise(r => setTimeout(r, 80));
    return await tryEquip();
  };

  // 掘削ヘルパー（適切なツール・移動込み）
  const digAt = async (pos) => {
    try {
      if (ctx.gotoBlockAndDig) {
        await ctx.gotoBlockAndDig(pos);
      } else {
        try { if (ctx.gotoBlock) await ctx.gotoBlock(pos); } catch (_) {}
        const b = bot.blockAt(pos);
        if (b && b.name !== 'air') await bot.dig(b);
      }
      await new Promise(r => setTimeout(r, 120));
    } catch (_) {}
  };

  const tryScaffoldWithSlime = async (targetPos) => {
    const slime = bot.inventory.items().find(i => i.name === 'slime_block');
    if (!slime) { ctx.log?.('足場が必要ですが slime_block が在庫にありません'); return { ok: false };
    }

    const dirs = [
      new Vec3(0, -1, 0), new Vec3(1, 0, 0), new Vec3(-1, 0, 0), new Vec3(0, 0, 1), new Vec3(0, 0, -1), new Vec3(0, 1, 0)
    ];

    for (const dir of dirs) {
      const sPos = targetPos.minus(dir);
      const b = bot.blockAt(sPos);
      if (b && b.name !== 'air') continue;
      const sRef = ctx.findPlaceRefForTarget(sPos);
      if (!sRef) continue;

      try {
        await bot.equip(slime, 'hand');
        bot.setControlState('sneak', true);
        await bot.placeBlock(sRef.refBlock, sRef.face);
        await new Promise(r => setTimeout(r, 120));
        // 記録しておく（後で回収）
        scaffoldList.push(sPos.clone());
        ctx.log?.(`足場を設置: slime_block @ ${sPos.x},${sPos.y},${sPos.z}`);
        return { ok: true, scaffoldPos: sPos };
      } catch (_) {
        // try next dir
      } finally {
        bot.setControlState('sneak', false);
      }
    }
    return { ok: false };
  };

  for (const blockInfo of blocks) {
    if (shouldCancel()) break;
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

      // 参照ブロックを探す（なければスライムで足場）
      let ref = ctx.findPlaceRefForTarget(targetPos);
      let scaffoldPos = null;
      if (!ref) {
        const s = await tryScaffoldWithSlime(targetPos);
        if (s.ok) {
          scaffoldPos = s.scaffoldPos;
          ref = ctx.findPlaceRefForTarget(targetPos);
        }
      }
      if (!ref) {
        placed++;
        if (options.onProgress) options.onProgress(placed, total);
        continue;
      }

      // ブロックの近くまで移動
      if (shouldCancel()) break;
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
      if (shouldCancel()) break;
      const okEquip = await ensureHeldItem(blockInfo.name);
      if (!okEquip) {
        // 装備に失敗した場合はスキップ
        placed++;
        if (options.onProgress) options.onProgress(placed, total);
        continue;
      }
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

      // 足場の後片付け（その場で回収。設計に含まれない位置のみ）
      if (shouldCancel()) break;
      if (scaffoldPos && !plannedSet.has(posKey(scaffoldPos))) {
        const sBlock = bot.blockAt(scaffoldPos);
        if (sBlock && sBlock.name === 'slime_block') {
          await digAt(scaffoldPos);
        }
      }

    } catch (error) {
      placed++;
      if (options.onProgress) options.onProgress(placed, total);
    }
  }

  // 検査＆修復パス: 設計と違う/穴が空いている箇所を修正
  for (const blockInfo of blocks) {
    if (shouldCancel()) break;
    try {
      const targetPos = new Vec3(blockInfo.x, blockInfo.y, blockInfo.z);
      const desired = blockInfo.name;

      const haveItem = bot.inventory.items().find(i => i.name === desired);
      if (!haveItem) continue;

      let worldBlock = bot.blockAt(targetPos);
      if (worldBlock && worldBlock.name === desired) continue; // OK

      // 異種ブロックなら撤去（適したツールで掘削）
      if (worldBlock && worldBlock.name !== 'air' && worldBlock.name !== desired) {
        try {
          if (ctx.gotoBlockAndDig) {
            await ctx.gotoBlockAndDig(targetPos);
          } else {
            try { if (ctx.gotoBlock) await ctx.gotoBlock(targetPos); } catch (_) {}
            await bot.dig(worldBlock);
          }
          await new Promise(r => setTimeout(r, 120));
        } catch (_) {
          // 掘れなければ諦め
          continue;
        }
      }

      // 参照ブロック確保
      let ref = ctx.findPlaceRefForTarget(targetPos);
      let scaffoldPos = null;
      if (!ref) {
        const s = await tryScaffoldWithSlime(targetPos);
        if (s.ok) {
          scaffoldPos = s.scaffoldPos;
          ref = ctx.findPlaceRefForTarget(targetPos);
        }
      }
      if (!ref) continue;

      // 近くへ移動
      if (shouldCancel()) break;
      const distance = bot.entity.position.distanceTo(targetPos);
      if (distance > 4) {
        try { await ctx.gotoBlock(targetPos); await new Promise(r => setTimeout(r, 100)); } catch (_) { continue; }
      }

      // 置く
      if (shouldCancel()) break;
      try {
        const okEquip2 = await ensureHeldItem(desired);
        if (!okEquip2) continue;
        bot.setControlState('sneak', true);
        await bot.placeBlock(ref.refBlock, ref.face);
        await new Promise(r => setTimeout(r, 150));
      } catch (_) {
        // ignore
      } finally {
        bot.setControlState('sneak', false);
      }

      // 足場があれば可能なら即回収
      if (scaffoldPos && !plannedSet.has(posKey(scaffoldPos))) {
        const sBlock = bot.blockAt(scaffoldPos);
        if (sBlock && sBlock.name === 'slime_block') {
          await digAt(scaffoldPos);
        }
      }

    } catch (_) { /* ignore */ }
  }

  // 修正時に置いた足場が残っていればここでも回収
  for (const sPos of scaffoldList) {
    if (shouldCancel()) break;
    try {
      if (plannedSet.has(posKey(sPos))) continue;
      const b = bot.blockAt(sPos);
      if (!b || b.name !== 'slime_block') continue;
      await digAt(sPos);
    } catch (_) {}
  }

  // 最終回収パス: 残っている足場スライムを回収
  for (const sPos of scaffoldList) {
    if (shouldCancel()) break;
    try {
      if (plannedSet.has(posKey(sPos))) continue; // 設計に含まれる位置は触らない
      const b = bot.blockAt(sPos);
      if (!b || b.name !== 'slime_block') continue;
      await digAt(sPos);
    } catch (_) {}
  }

  // 追加回収/清掃: 設計範囲+周囲1を走査
  //  - 残存するスライム足場を除去
  //  - 設計外の余分なブロック（設計範囲内）の除去
  if (!shouldCancel()) {
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (const b of blocks) {
      if (b.x < minX) minX = b.x; if (b.x > maxX) maxX = b.x;
      if (b.y < minY) minY = b.y; if (b.y > maxY) maxY = b.y;
      if (b.z < minZ) minZ = b.z; if (b.z > maxZ) maxZ = b.z;
    }
    for (let x = minX-1; x <= maxX+1 && !shouldCancel(); x++) {
      for (let y = minY; y <= maxY+1 && !shouldCancel(); y++) {
        for (let z = minZ-1; z <= maxZ+1 && !shouldCancel(); z++) {
          const p = new Vec3(x,y,z);
          const wb = bot.blockAt(p);
          if (wb && wb.name === 'slime_block' && !plannedSet.has(posKey(p))) {
            await digAt(p);
          }
          // 設計範囲内の余分なブロックを除去（air 以外で設計外）
          const inPlannedBox = (x >= minX && x <= maxX && y >= minY && y <= maxY && z >= minZ && z <= maxZ);
          if (inPlannedBox && wb && wb.name !== 'air' && !plannedSet.has(posKey(p)) && !plannedExtraSet.has(posKey(p))) {
            // スライムは上で除去済み。その他の異物を除去
            await digAt(p);
          }
        }
      }
    }
  }

  // 最終: 足場除去で置けるようになった穴があればもう一度だけ修復試行
  if (!shouldCancel()) {
    for (const blockInfo of blocks) {
      if (shouldCancel()) break;
      try {
        const targetPos = new Vec3(blockInfo.x, blockInfo.y, blockInfo.z);
        const desired = blockInfo.name;
        const haveItem = bot.inventory.items().find(i => i.name === desired);
        if (!haveItem) continue;
        const worldBlock = bot.blockAt(targetPos);
        if (worldBlock && worldBlock.name === desired) continue;
        if (worldBlock && worldBlock.name !== 'air') continue; // 異物除去は前段で対応済み
        // 参照
        let ref = ctx.findPlaceRefForTarget(targetPos);
        if (!ref) {
          const s = await tryScaffoldWithSlime(targetPos);
          if (s.ok) ref = ctx.findPlaceRefForTarget(targetPos);
        }
        if (!ref) continue;
        try { if (ctx.gotoBlock) await ctx.gotoBlock(targetPos); } catch (_) { continue; }
        try {
          await bot.equip(haveItem, 'hand');
          bot.setControlState('sneak', true);
          await bot.placeBlock(ref.refBlock, ref.face);
        } catch (_) { } finally { bot.setControlState('sneak', false); }
        await new Promise(r => setTimeout(r, 120));
      } catch (_) {}
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

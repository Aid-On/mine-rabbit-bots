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
  // plannedSet: 設計にあるブロックの座標（airを除く）
  const plannedSet = new Set();
  for (const b of blocks) {
    const name = String(b.name || '').toLowerCase().replace('minecraft:', '');
    if (name !== 'air' && name !== 'void_air' && name !== 'cave_air') {
      plannedSet.add(`${b.x},${b.y},${b.z}`);
    }
  }

  // マルチブロック（ドア上部など）で設計上は暗黙に必要になる座標をホワイトリスト
  const plannedExtraSet = new Set();
  for (const b of blocks) {
    try {
      const name = String(b.name || '').toLowerCase();
      if (name.endsWith('_door')) {
        plannedExtraSet.add(`${b.x},${b.y + 1},${b.z}`);
      }
      if (name.includes('bed')) {
        // ベッドは方向依存で座標がずれるため、周囲1マスを保護候補にするか、
        // あるいはschematicが完全であることを期待する。
        // ここでは安全のため、schematicに含まれるベッド座標の周囲(水平)を保護リストに入れる...のは危険か。
        // schematicが完全なら不要。
      }
    } catch (_) { }
  }

  // (x,z)ごとの最高高度を記録（部屋の中判定用）
  const maxYMap = new Map();
  for (const b of blocks) {
    const name = String(b.name || '').toLowerCase().replace('minecraft:', '');
    if (name !== 'air' && name !== 'void_air' && name !== 'cave_air') {
      const key = `${b.x},${b.z}`;
      const currentMax = maxYMap.get(key);
      if (currentMax === undefined || b.y > currentMax) {
        maxYMap.set(key, b.y);
      }
    }
  }

  // 設置したスライム足場を記録
  const scaffoldList = [];

  // 指定したブロック名が確実に手に持たれているかを確認して装備
  const ensureHeldItem = async (blockName) => {
    const tryEquip = async () => {
      const it = bot.inventory.items().find(i => i.name === blockName);
      if (!it) return false;

      // 既に持っているならOK
      if (bot.heldItem && bot.heldItem.name === blockName) return true;

      try { await bot.equip(it, 'hand'); } catch (_) { return false; }
      await new Promise(r => setTimeout(r, 250)); // 待機時間を延長
      return bot.heldItem && bot.heldItem.name === blockName;
    };

    if (await tryEquip()) return true;
    // リトライ
    for (let i = 0; i < 3; i++) {
      await new Promise(r => setTimeout(r, 200));
      if (await tryEquip()) return true;
    }
    return false;
  };

  // 掘削ヘルパー（適切なツール・移動込み）
  const digAt = async (pos) => {
    try {
      if (ctx.gotoBlockAndDig) {
        await ctx.gotoBlockAndDig(pos);
      } else {
        try { if (ctx.gotoBlock) await ctx.gotoBlock(pos); } catch (_) { }
        const b = bot.blockAt(pos);
        if (b && b.name !== 'air') await bot.dig(b);
      }
      await new Promise(r => setTimeout(r, 120));
    } catch (_) { }
  };

  const tryScaffoldWithSlime = async (targetPos) => {
    const slime = bot.inventory.items().find(i => i.name === 'slime_block');
    if (!slime) { ctx.log?.('足場が必要ですが slime_block が在庫にありません'); return { ok: false }; }

    // 部屋の中（設計上の屋根より下）には足場を置かないチェック
    const isInsideRoom = (pos) => {
      const key = `${pos.x},${pos.z}`;
      const maxY = maxYMap.get(key);
      // 設計範囲内(maxYがある) かつ その高さより低い位置 は「部屋の中」とみなす
      // ただし、maxYと同じ高さなら「屋根の上」なのでOKとする
      if (maxY !== undefined && pos.y < maxY) return true;
      return false;
    };

    // 戦略1: ターゲットの周囲(隣接)に置ける場所があるか探す
    // 戦略2: ターゲットの真下が空中なら、地面まで探索して柱を立てる (Pillaring)

    // まずは既存の隣接・近傍チェック
    const candidates = [];
    // 下方向 (y-1) を最優先
    candidates.push(targetPos.offset(0, -1, 0));
    // 周囲
    const dirs = [
      new Vec3(1, 0, 0), new Vec3(-1, 0, 0), new Vec3(0, 0, 1), new Vec3(0, 0, -1),
      new Vec3(0, 1, 0)
    ];
    candidates.push(...dirs.map(d => targetPos.minus(d)));

    for (const sPos of candidates) {
      if (isInsideRoom(sPos)) continue; // 部屋の中ならスキップ

      const b = bot.blockAt(sPos);
      if (b && b.name !== 'air') continue; // 既にブロックがある
      if (sPos.distanceTo(targetPos) > 5) continue; // 遠すぎる

      const sRef = ctx.findPlaceRefForTarget(sPos);
      if (sRef) {
        // 置ける
        try {
          const distToScaffold = bot.entity.position.distanceTo(sPos);
          if (distToScaffold > 4.5) {
            try { if (ctx.gotoBlock) await ctx.gotoBlock(sPos); } catch (_) { }
          }
          await bot.equip(slime, 'hand');
          bot.setControlState('sneak', true);
          await bot.placeBlock(sRef.refBlock, sRef.face);
          await new Promise(r => setTimeout(r, 120));
          scaffoldList.push(sPos.clone());
          return { ok: true, scaffoldPos: sPos };
        } catch (_) { } finally { bot.setControlState('sneak', false); }
      }
    }

    // 戦略2: 真下へのピラーリング (最大10ブロック下まで探索)
    const pillarX = targetPos.x;
    const pillarZ = targetPos.z;
    let groundY = -1;

    // ターゲットの真下(y-1)から下へスキャン
    for (let y = targetPos.y - 1; y >= targetPos.y - 10; y--) {
      const p = new Vec3(pillarX, y, pillarZ);
      if (isInsideRoom(p)) continue; // 部屋の中なら土台にしない（柱を立てない）

      const b = bot.blockAt(p);
      if (b && b.name !== 'air') {
        // 土台発見
        groundY = y;
        break;
      }
    }

    if (groundY !== -1) {
      // groundY+1 から targetPos.y-1 まで積み上げる
      // 下から順に
      for (let y = groundY + 1; y < targetPos.y; y++) {
        const p = new Vec3(pillarX, y, pillarZ);
        if (isInsideRoom(p)) continue; // 部屋の中には置かない

        const b = bot.blockAt(p);
        if (b && b.name !== 'air') continue; // 既に埋まってる

        // 置くための参照は「下のブロック」
        const below = new Vec3(pillarX, y - 1, pillarZ);
        const belowBlock = bot.blockAt(below);
        if (!belowBlock || belowBlock.name === 'air') continue; // ありえないはずだが

        try {
          // 届く範囲に移動
          const dist = bot.entity.position.distanceTo(p);
          if (dist > 4.5) {
            try { if (ctx.gotoBlock) await ctx.gotoBlock(p); } catch (_) { }
          }

          await bot.equip(slime, 'hand');
          // 真下に置くイメージ (belowBlockの上面)
          await bot.placeBlock(belowBlock, new Vec3(0, 1, 0));
          await new Promise(r => setTimeout(r, 120));
          scaffoldList.push(p.clone());
          ctx.log?.(`足場柱を設置: ${p.x},${p.y},${p.z}`);
        } catch (e) {
          // 失敗したら中断
          return { ok: false };
        }
      }
      // 柱の最上段が置けていれば成功とみなす
      const topPillar = new Vec3(pillarX, targetPos.y - 1, pillarZ);
      if (bot.blockAt(topPillar)?.name === 'slime_block') {
        return { ok: true, scaffoldPos: topPillar };
      }
    }

    return { ok: false };
  };

  // Phase 1: メイン建築ループ
  // 進捗がある限り繰り返す（届かない場所も、隣が置ければ届くようになるため）
  let passCount = 0;
  let progress = true;

  while (progress && passCount < 20 && !shouldCancel()) {
    passCount++;
    let placedInThisPass = 0;

    // まだ正しく置かれていないブロックのみを対象にする
    const remainingBlocks = blocks.filter(b => {
      const current = bot.blockAt(new Vec3(b.x, b.y, b.z));
      return !current || current.name !== b.name;
    });

    if (remainingBlocks.length === 0) break;

    ctx.log?.(`パス ${passCount}: 残り ${remainingBlocks.length} ブロック`);

    for (const blockInfo of remainingBlocks) {
      if (shouldCancel()) break;
      try {
        const targetPos = new Vec3(blockInfo.x, blockInfo.y, blockInfo.z);

        // アイテムを装備
        const item = bot.inventory.items().find(i => i.name === blockInfo.name);
        if (!item) {
          if (passCount === 1) ctx.log?.(`${blockInfo.name} が不足 (スキップ)`);
          continue;
        }

        // すでにブロックがある場合はスキップ
        const existingBlock = bot.blockAt(targetPos);
        if (existingBlock && existingBlock.name !== 'air') {
          if (existingBlock.name === blockInfo.name) continue;
          // 違うブロックがある -> 後続の修復フェーズで直す
          continue;
        }

        // 参照ブロックを探す
        let ref = ctx.findPlaceRefForTarget(targetPos);
        if (!ref) {
          const s = await tryScaffoldWithSlime(targetPos);
          if (s.ok) {
            ref = ctx.findPlaceRefForTarget(targetPos);
          }
        }
        if (!ref) continue;

        // 移動
        const distance = bot.entity.position.distanceTo(targetPos);
        if (distance > 4.5) {
          try {
            await ctx.gotoBlock(targetPos);
            await new Promise(resolve => setTimeout(resolve, 100));
          } catch (moveError) { continue; }
        }

        // 設置
        if (shouldCancel()) break;
        const okEquip = await ensureHeldItem(blockInfo.name);
        if (!okEquip) continue;
        if (bot.heldItem?.name !== blockInfo.name) continue;

        bot.setControlState('sneak', true);
        try {
          await bot.placeBlock(ref.refBlock, ref.face);
          placed++;
          placedInThisPass++;
          if (options.onProgress) options.onProgress(placed, total);
          await new Promise(resolve => setTimeout(resolve, 150));
        } catch (placeError) {
        } finally {
          bot.setControlState('sneak', false);
        }
      } catch (_) { /* ignore */ }
    }

    progress = placedInThisPass > 0;
    if (progress) {
      ctx.log?.(`パス ${passCount} 完了: ${placedInThisPass} 個設置`);
    }
  }

  // Phase 2: 検査＆修復・清掃ループ
  // 完全に一致するまでしつこく繰り返す
  let repairRound = 0;

  while (repairRound < 10 && !shouldCancel()) {
    repairRound++;
    let actionCount = 0;
    let mismatchCount = 0;

    ctx.log?.(`点検ラウンド ${repairRound} 開始...`);

    // 2-1. 設計図にあるブロックの確認・修復
    for (const blockInfo of blocks) {
      if (shouldCancel()) break;
      try {
        const targetPos = new Vec3(blockInfo.x, blockInfo.y, blockInfo.z);
        const desired = blockInfo.name;

        const worldBlock = bot.blockAt(targetPos);

        // 一致しているならOK
        if (worldBlock && worldBlock.name === desired) continue;

        mismatchCount++;

        // 異種ブロックなら撤去
        if (worldBlock && worldBlock.name !== 'air') {
          try {
            if (ctx.gotoBlockAndDig) {
              await ctx.gotoBlockAndDig(targetPos);
            } else {
              try { if (ctx.gotoBlock) await ctx.gotoBlock(targetPos); } catch (_) { }
              await bot.dig(worldBlock);
            }
            await new Promise(r => setTimeout(r, 120));
            actionCount++;
          } catch (_) { continue; } // 壊せなければスキップ
        }

        // 正しいブロックを設置
        const haveItem = bot.inventory.items().find(i => i.name === desired);
        if (!haveItem) continue;

        let ref = ctx.findPlaceRefForTarget(targetPos);
        if (!ref) {
          const s = await tryScaffoldWithSlime(targetPos);
          if (s.ok) ref = ctx.findPlaceRefForTarget(targetPos);
        }
        if (!ref) continue;

        const distance = bot.entity.position.distanceTo(targetPos);
        if (distance > 4.5) {
          try { await ctx.gotoBlock(targetPos); await new Promise(r => setTimeout(r, 100)); } catch (_) { continue; }
        }

        const okEquip = await ensureHeldItem(desired);
        if (!okEquip) continue;
        if (bot.heldItem?.name !== desired) continue;

        bot.setControlState('sneak', true);
        try {
          await bot.placeBlock(ref.refBlock, ref.face);
          await new Promise(r => setTimeout(r, 150));
          actionCount++;
        } catch (_) {
        } finally {
          bot.setControlState('sneak', false);
        }
      } catch (_) { /* ignore */ }
    }

    // 2-2. 設計図にないブロック（ゴミ）の確認・撤去
    if (!shouldCancel()) {
      let minX = Infinity, minY = Infinity, minZ = Infinity;
      let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
      for (const b of blocks) {
        if (b.x < minX) minX = b.x; if (b.x > maxX) maxX = b.x;
        if (b.y < minY) minY = b.y; if (b.y > maxY) maxY = b.y;
        if (b.z < minZ) minZ = b.z; if (b.z > maxZ) maxZ = b.z;
      }

      for (let y = maxY + 1; y >= minY; y--) {
        if (shouldCancel()) break;
        for (let x = minX - 1; x <= maxX + 1; x++) {
          for (let z = minZ - 1; z <= maxZ + 1; z++) {
            if (shouldCancel()) break;
            const p = new Vec3(x, y, z);
            const wb = bot.blockAt(p);
            if (!wb || wb.name === 'air') continue;

            if (plannedSet.has(posKey(p))) continue;
            if (plannedExtraSet.has(posKey(p))) continue;

            // 自分が置いた足場は維持
            const isMyScaffold = scaffoldList.some(sp => sp.equals(p));
            if (isMyScaffold) continue;

            try {
              await digAt(p);
              actionCount++;
            } catch (_) { }
          }
        }
      }
    }

    ctx.log?.(`ラウンド ${repairRound} 終了: ${actionCount} 箇所操作, 残り不一致 ${mismatchCount}`);

    if (mismatchCount === 0) {
      ctx.log?.('点検完了: 全て設計通りです');
      break;
    }

    if (actionCount === 0) {
      ctx.log?.('点検中断: これ以上修復できません（進捗なし）');
      break;
    }

    await new Promise(r => setTimeout(r, 500));
  }

  // Phase 3: 最終清掃
  ctx.log?.('最終清掃: 足場を回収します');
  for (const sPos of scaffoldList) {
    if (shouldCancel()) break;
    try {
      if (plannedSet.has(posKey(sPos))) continue;
      const b = bot.blockAt(sPos);
      if (!b || b.name !== 'slime_block') continue;
      await digAt(sPos);
    } catch (_) { }
  }

  // エリア内のスライムを一掃
  if (!shouldCancel()) {
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    for (const b of blocks) {
      if (b.x < minX) minX = b.x; if (b.x > maxX) maxX = b.x;
      if (b.y < minY) minY = b.y; if (b.y > maxY) maxY = b.y;
      if (b.z < minZ) minZ = b.z; if (b.z > maxZ) maxZ = b.z;
    }
    for (let y = maxY + 1; y >= minY; y--) {
      for (let x = minX - 1; x <= maxX + 1; x++) {
        for (let z = minZ - 1; z <= maxZ + 1; z++) {
          if (shouldCancel()) break;
          const p = new Vec3(x, y, z);
          if (plannedSet.has(posKey(p))) continue;
          const b = bot.blockAt(p);
          if (b && b.name === 'slime_block') {
            await digAt(p);
          }
        }
      }
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

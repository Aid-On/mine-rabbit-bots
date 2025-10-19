#!/usr/bin/env node
import { createBot } from 'mineflayer';
import pathfinderPlugin from 'mineflayer-pathfinder';
import minecraftData from 'minecraft-data';
import { Vec3 } from 'vec3';
import './env.js';
import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { registerActions } from './actions/index.js';
import { craftWithAuto as libCraftWithAuto } from './lib/crafting.js';
import { smeltAuto as libSmeltAuto, openOrApproachFurnace as libOpenOrApproachFurnace, ensureFuelInFurnace as libEnsureFuelInFurnace, smeltSources as libSmeltSources } from './lib/furnace.js';
import { invCountById as libInvCountById, itemNameById as libItemNameById, invCountByName as libInvCountByName } from './lib/inventory.js';
import { gatherSources as libGatherSources, gatherItemByMining as libGatherItemByMining } from './lib/gather.js';

const { pathfinder, Movements, goals } = pathfinderPlugin;

// Support host specified as "host" or "host:port"
const rawHost = process.env.MINEFLYER_HOST || '127.0.0.1';
let host = rawHost;
let hostPortFromHost = null;
if (rawHost.includes(':')) {
  const parts = rawHost.split(':');
  host = parts[0];
  hostPortFromHost = parts[1];
}
const port = Number(process.env.MINEFLYER_PORT || hostPortFromHost || 25565);
const username = process.env.MINEFLYER_USERNAME || 'pino';
console.log(`[${username}] 接続先: ${host}:${port}`);
const versionEnv = process.env.MINEFLYER_VERSION;
const version = versionEnv === undefined || versionEnv === '' ? false : versionEnv;

const log = (message) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${username}] ${message}`);
};

const bot = createBot({
  host,
  port,
  username,
  version,
  auth: 'offline'
});

bot.loadPlugin(pathfinder);

let mcDataGlobal = null;
let jaDict = {};

// パフォーマンス設定（軽量化切替）
const perf = {
  mode: 'light', // 'light' | 'normal'
};
const dist = {
  near: () => 6,
  mid: () => (perf.mode === 'light' ? 10 : 12),
  far: () => (perf.mode === 'light' ? 24 : 48)
};

// チェスト操作の同時実行を避けるためのロック
let chestBusy = false;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const acquireChestLock = async (timeoutMs = 8000) => {
  const start = Date.now();
  while (chestBusy) {
    if (Date.now() - start > timeoutMs) break;
    await sleep(50);
  }
  chestBusy = true;
  let released = false;
  return () => { if (!released) { chestBusy = false; released = true; } };
};

const loadJaDict = async () => {
  try {
    const buf = await readFile(new URL('../data/ja-items.json', import.meta.url));
    const obj = JSON.parse(String(buf));
    if (obj && typeof obj === 'object') jaDict = obj;
    log(`日本語名辞書を読み込みました (${Object.keys(jaDict).length} 件)`);
  } catch (e) {
    // 任意ファイルのため存在しなくてもよい
  }
};

const saveJaDict = async () => {
  try {
    const fileUrl = new URL('../data/ja-items.json', import.meta.url);
    // 念のためディレクトリを作成（存在してもOK）
    const dir = path.dirname(fileUrl.pathname);
    await mkdir(dir, { recursive: true });
    await writeFile(fileUrl, JSON.stringify(jaDict, null, 2));
    return true;
  } catch (e) {
    log(`日本語辞書の保存に失敗: ${e.message}`);
    return false;
  }
};

bot.once('spawn', () => {
  log(`スポーンしました: ${host}:${port} / ${bot.username}`);

  bot.chat(`/say Bot ${bot.username} がオンラインになりました`);

  mcDataGlobal = minecraftData(bot.version);
  const defaultMove = new Movements(bot, mcDataGlobal);
  if (bot.pathfinder?.setMovements) {
    bot.pathfinder.setMovements(defaultMove);
  }

  // 日本語辞書の読み込み（存在すれば）
  loadJaDict();
});

const state = {
  followTarget: null,
  followTask: null
};

const clearFollowTask = () => {
  if (state.followTask) {
    clearInterval(state.followTask);
    state.followTask = null;
  }
};

const startFollowing = (target) => {
  state.followTarget = target;
  clearFollowTask();
  state.followTask = setInterval(() => {
    const player = bot.players[state.followTarget];
    if (player?.entity) {
      const pos = player.entity.position;
      if (bot.pathfinder?.setGoal) {
        bot.pathfinder.setGoal(new goals.GoalNear(pos.x, pos.y, pos.z, 2));
      }
      return;
    }

    log(`フォロー対象が見つかりません: ${state.followTarget}`);
    stopFollowing();
  }, 1000);
};

const stopFollowing = () => {
  state.followTarget = null;
  clearFollowTask();
  if (bot.pathfinder?.setGoal) {
    bot.pathfinder.setGoal(null);
  }
};

const commandHandlers = new Map();
// 日本語アイテム名（よく使う代表的なもの）
const jaItemNames = {
  stick: '棒',
  torch: '松明',
  cobblestone: '丸石',
  stone: '石',
  dirt: '土',
  sand: '砂',
  glass: 'ガラス',
  oak_log: 'オークの原木',
  birch_log: 'シラカバの原木',
  spruce_log: 'トウヒの原木',
  jungle_log: 'ジャングルの原木',
  acacia_log: 'アカシアの原木',
  dark_oak_log: 'ダークオークの原木',
  oak_planks: 'オークの板材',
  birch_planks: 'シラカバの板材',
  spruce_planks: 'トウヒの板材',
  jungle_planks: 'ジャングルの板材',
  acacia_planks: 'アカシアの板材',
  dark_oak_planks: 'ダークオークの板材',
  crafting_table: '作業台',
  furnace: 'かまど',
  chest: 'チェスト',
  coal: '石炭',
  charcoal: '木炭',
  iron_ingot: '鉄インゴット',
  gold_ingot: '金インゴット',
  diamond: 'ダイヤモンド',
  emerald: 'エメラルド',
  redstone: 'レッドストーンダスト',
  ladder: 'はしご',
  bucket: 'バケツ',
  water_bucket: '水入りバケツ',
  lava_bucket: '溶岩入りバケツ',
  wheat: '小麦',
  wheat_seeds: '小麦の種',
  bread: 'パン',
  apple: 'りんご',
  oak_sapling: 'オークの苗木'
};

const getJaItemName = (name) => {
  if (!name) return '';
  if (jaDict[name]) return jaDict[name];
  if (jaItemNames[name]) return jaItemNames[name];
  // mcData に定義があれば displayName を使い、日本語が無い場合は英名をそのまま返す
  try {
    const def = mcDataGlobal?.itemsByName?.[name];
    if (def?.displayName) return def.displayName; // 英名の人間可読名
  } catch (_) {}
  // 最後の手段: アンダースコアをスペースに
  return name.replace(/_/g, ' ');
};

const findNearestBlockByName = (name, {
  maxDistance = dist.far(),
  count = 1
} = {}) => {
  if (!mcDataGlobal) return [];
  const def = mcDataGlobal.blocksByName[name];
  if (!def) return [];
  const positions = bot.findBlocks({ matching: def.id, maxDistance, count: Math.max(1, count) });
  // Sort by distance (nearest first) unless only 1 requested
  if ((count || 1) > 1) {
    positions.sort((a, b) => a.distanceTo(bot.entity.position) - b.distanceTo(bot.entity.position));
  }
  return positions;
};

// 釣り機能は削除されました
/*
const findShoreNearWideWater = (maxDistance = 32, maxCount = 96) => {
  if (!mcDataGlobal) return null;
  const water = mcDataGlobal.blocksByName['water'];
  if (!water) return null;
  const waters = bot.findBlocks({ matching: water.id, maxDistance, count: maxCount });
  if (!waters || waters.length === 0) return null;
  const scoreAt = (p) => {
    let s = 0;
    for (let dx = -3; dx <= 3; dx++) {
      for (let dz = -3; dz <= 3; dz++) {
        const q = p.offset(dx, 0, dz);
        const b = bot.blockAt(q);
        if (b && b.name === 'water') s++;
      }
    }
    return s;
  };
  let best = null;
  let bestScore = -1;
  for (const p of waters) {
    const score = scoreAt(p);
    if (score > bestScore) {
      // 岸（隣が地面）を探す
      const dirs = [new Vec3(1,0,0), new Vec3(-1,0,0), new Vec3(0,0,1), new Vec3(0,0,-1)];
      for (const d of dirs) {
        const shorePos = p.minus(d); // 水の隣のブロック
        const ground = bot.blockAt(shorePos);
        const above = bot.blockAt(shorePos.offset(0, 1, 0));
        if (ground && ground.name !== 'water' && isSolid(ground) && isAirLike(above)) {
          best = { shorePos, lookPos: p };
          bestScore = score;
          break;
        }
      }
    }
  }
  return best;
};

// 現在向いている方向に沿って水を探す（front ベクトルを使用）
const findWaterAlongFront = (maxSteps = 16) => {
  const base = bot.entity.position.floored();
  const { front } = yawToDir();
  let cur = base.clone();
  for (let i = 0; i < maxSteps; i++) {
    cur = cur.plus(front);
    // 同じ高さか1段下を水判定
    const here = bot.blockAt(cur);
    const below = bot.blockAt(cur.offset(0, -1, 0));
    const isWaterHere = here && here.name === 'water';
    const isWaterBelow = below && below.name === 'water';
    const waterPos = isWaterHere ? cur : (isWaterBelow ? cur.offset(0, -1, 0) : null);
    if (waterPos) {
      // 岸（隣接の固体ブロック + 頭上が空気）
      const candidates = [
        waterPos.minus(front),
        waterPos.plus(front),
        waterPos.plus(new Vec3(1, 0, 0)),
        waterPos.plus(new Vec3(-1, 0, 0)),
        waterPos.plus(new Vec3(0, 0, 1)),
        waterPos.plus(new Vec3(0, 0, -1))
      ];
      for (const shore of candidates) {
        const ground = bot.blockAt(shore);
        const head = bot.blockAt(shore.offset(0, 1, 0));
        if (ground && ground.name !== 'water' && isSolid(ground) && isAirLike(head)) {
          return { shorePos: shore, waterPos };
        }
      }
      // 岸が無い場合でも見つけたことにする
      return { shorePos: base, waterPos };
    }
  }
  return null;
};

const gotoShoreAndFaceWater = async () => {
  // キャッシュを優先（30秒以内）
  const now = Date.now();
  if (fishState.lastShore && (now - fishState.lastShore.ts < 30000)) {
    const { shorePos, waterPos } = fishState.lastShore;
    try { await gotoBlock(shorePos); } catch (_) {}
    try {
      const lp = new Vec3(waterPos.x + 0.5, waterPos.y + 0.2, waterPos.z + 0.5);
      await bot.lookAt(lp, true);
    } catch (_) {}
    return true;
  }

  const found = findShoreNearWideWater(48, 96);
  if (!found) return false;
  const { shorePos, lookPos } = found;
  try { await gotoBlock(shorePos); } catch (_) {}
  try {
    const lp = new Vec3(lookPos.x + 0.5, lookPos.y + 0.2, lookPos.z + 0.5);
    await bot.lookAt(lp, true);
  } catch (_) {}
  fishState.lastShore = { shorePos, waterPos: lookPos, ts: Date.now() };
  return true;
};

const moveNearWaterIfNeeded = async () => {
  try {
    // まず現在の向きの先を優先（軽量モードは短距離のみ）
    const maxSteps = fishState.mode === 'light' ? 10 : 20;
    const ahead = findWaterAlongFront(maxSteps);
    if (ahead) {
      try { await gotoBlock(ahead.shorePos); } catch (_) {}
      try {
        const lp = new Vec3(ahead.waterPos.x + 0.5, ahead.waterPos.y + 0.2, ahead.waterPos.z + 0.5);
        await bot.lookAt(lp, true);
      } catch (_) {}
      return true;
    }
    // 見つからなければ（通常モードのみ）広い水場へ
    if (fishState.mode !== 'light') {
      return await gotoShoreAndFaceWater();
    }
    return false;
  } catch (_) { return false; }
};

const fishOnce = async () => {
  await ensureFishingRodEquipped();
  if (typeof bot.fish === 'function') {
    try {
      await bot.fish();
    } catch (e) {
      // 水が遠い場合は近づいて再試行
      if (/water|no water/i.test(String(e?.message || ''))) {
        const moved = await moveNearWaterIfNeeded();
        if (moved) await bot.fish(); else throw e;
      } else {
        throw e;
      }
    }
  } else {
    // 後方互換（簡易）
    bot.activateItem();
    // 適度な待機後に解除（完全な検出は bot.fish が最適）
    await new Promise((r) => setTimeout(r, 6000));
    bot.deactivateItem?.();
  }
};

// 釣り戦利品を近くのチェストへ自動格納
const openNearbyChest = async (maxDistance = 6) => {
  const block = findNearestChest(maxDistance);
  if (!block) return null;
  try {
    const chest = await bot.openChest(block);
    await sleep(120);
    return chest;
  } catch (_) { return null; }
};

const depositFishingLoot = async () => {
  // 釣ったアイテムを格納（モードにより対象を切替）
  const held = bot.heldItem || null;
  const lootSet = new Set([
    'cod','salmon','tropical_fish','pufferfish','raw_fish',
    'nautilus_shell','name_tag','saddle','enchanted_book','bow','fishing_rod',
    'string','stick','leather','bone','bowl','tripwire_hook','rotten_flesh','lily_pad','ink_sac','water_bottle'
  ]);
  const stacks = bot.inventory.items().filter((it) => {
    if (!it) return false;
    // 使っている釣り竿は除外
    if (it.name === 'fishing_rod' && held && it.slot === held.slot) return false;
    if (fishState.deposit === 'off') return false;
    if (fishState.deposit === 'loot') return lootSet.has(it.name);
    return true; // 'all'
  });
  if (stacks.length === 0) return 0;
  try {
    // まず近傍チェスト（移動なし）
    if (chestBusy) return 0; // 他操作と競合しないようスキップ
    let chest = await openNearbyChest(6);
    // 見つからない場合は控えめに移動して開く（10秒に1回まで）
    if (!chest) {
      const now = Date.now();
      if (now - fishState.lastDepositAt >= 10000) {
        try { chest = await openNearestChest(); } catch (_) { chest = null; }
      }
      if (!chest) return 0;
    }
    let moved = 0;
    let ops = 0;
    const pause = (ms) => new Promise(r => setTimeout(r, ms));
    for (const it of stacks) {
      let remain = it.count;
      while (remain > 0) {
        const put = Math.min(64, remain);
        let ok = false;
        for (let retry = 0; retry < 2 && !ok; retry++) {
          try {
            await chest.deposit(it.type, it.metadata ?? null, put);
            ok = true;
          } catch (_) {
            await pause(100);
          }
        }
        if (!ok) break;
        moved += put;
        remain -= put;
        ops++;
        await pause(80);
      }
    }
    chest.close();
    return moved;
  } catch (_) {
    // チェストが見つからない等は無視
    return 0;
  }
};
*/

const findNearestBlocksByIds = (ids, { maxDistance = dist.far(), count = 1 } = {}) => {  // 48 → 32 に削減
  if (!ids || ids.length === 0) return [];
  const positions = bot.findBlocks({ matching: (b) => ids.includes(typeof b === 'number' ? b : b.id), maxDistance, count: Math.max(1, count) });
  if ((count || 1) > 1) {
    positions.sort((a, b) => a.distanceTo(bot.entity.position) - b.distanceTo(bot.entity.position));
  }
  return positions;
};

// 掘削後のドロップ回収（近場のアイテムを集める）
const collectItemDropsAround = async (centerPos, { radius = 6, timeoutMs = 6000, maxLoops = 8 } = {}) => {
  const start = Date.now();
  const dist2 = (a, b) => a.distanceTo(b);
  const nearItems = () => Object.values(bot.entities || {})
    .filter((e) => e && e.name === 'item')
    .filter((e) => dist2(e.position, centerPos) <= radius)
    .sort((a, b) => dist2(a.position, bot.entity.position) - dist2(b.position, bot.entity.position));

  let loops = 0;
  while (Date.now() - start < timeoutMs && loops++ < maxLoops) {
    const items = nearItems();
    if (items.length === 0) {
      await new Promise((r) => setTimeout(r, 250));
      continue;
    }
    const it = items[0];
    try {
      if (bot.pathfinder?.goto) {
        const g = new goals.GoalNear(it.position.x, it.position.y, it.position.z, 1);
        await bot.pathfinder.goto(g);
      }
    } catch (_) {
      // 経路が取れない・拾えない場合は次へ
    }
    await new Promise((r) => setTimeout(r, 150));
  }
};

const gotoBlockAndDig = async (pos) => {
  const goal = new goals.GoalGetToBlock(pos.x, pos.y, pos.z);
  if (bot.pathfinder?.goto) {
    await bot.pathfinder.goto(goal);
  }
  const target = bot.blockAt(pos);
  if (!target || target.name === 'air') throw new Error('対象ブロックが存在しません');
  await equipBestToolFor(target);
  await bot.dig(target);
  // 掘削後のドロップを回収
  try {
    await collectItemDropsAround(pos, { radius: 6, timeoutMs: 6000 });
  } catch (_) {}
};

const gotoBlock = async (pos) => {
  const goal = new goals.GoalGetToBlock(pos.x, pos.y, pos.z);
  if (bot.pathfinder?.goto) {
    await bot.pathfinder.goto(goal);
  }
};

// ツール自動持ち替え（必要なブロックのみ）
const toolTierRank = (name = '') => {
  if (name.includes('netherite')) return 0;
  if (name.includes('diamond')) return 1;
  if (name.includes('iron')) return 2;
  if (name.includes('stone')) return 3;
  if (name.includes('golden')) return 4; // 金は速いが耐久低い
  if (name.includes('wooden')) return 5;
  if (name.includes('shears')) return 1; // せん断は専用
  return 9;
};

const guessToolForBlock = (block) => {
  const name = String(block?.name || '').toLowerCase();
  // 必須: 石系・鉱石系はピッケルが無いと基本ドロップしない
  const pickaxePatterns = /(ore|deepslate|cobblestone|stone|granite|diorite|andesite|netherrack|end_stone|obsidian|basalt|blackstone)/;
  if (pickaxePatterns.test(name)) return { tool: 'pickaxe', requireForDrop: true };

  // せん断が望ましいブロック
  if (name.includes('cobweb')) return { tool: 'shears', requireForDrop: true };
  if (name.includes('leaves')) return { tool: 'shears', requireForDrop: false };

  // シャベルが適切（ただし素手でもドロップはする）
  const shovelPatterns = /(dirt|grass_block|sand|gravel|clay|snow|snow_block|soul_sand|soul_soil|powder_snow|concrete_powder)/;
  if (shovelPatterns.test(name)) return { tool: 'shovel', requireForDrop: false };

  // 斧が適切（素手でもドロップするが効率化）
  const axePatterns = /(log|wood|stem|hyphae|planks|pumpkin|melon|crimson|warped)/;
  if (axePatterns.test(name)) return { tool: 'axe', requireForDrop: false };

  return { tool: null, requireForDrop: false };
};

const equipBestToolFor = async (block) => {
  const items = bot.inventory.items();

  // 候補ツール（名前で抽出）
  const toolLike = items.filter((it) => /pickaxe|axe|shovel|shears|hoe/.test(it.name));

  // 掘削時間を計算（実際の環境に合わせる）
  const creative = bot.game?.gameMode === 'creative';
  const inWater = !!bot.entity?.isInWater;
  const notOnGround = !bot.entity?.onGround;
  const entityEffects = bot.entity?.effects || {};

  const headSlot = bot.getEquipmentDestSlot ? bot.getEquipmentDestSlot('head') : null;
  const headItem = headSlot != null ? bot.inventory.slots[headSlot] : null;

  const digTimeWith = (itemOrNull) => {
    let type = null;
    let ench = [];
    if (itemOrNull) {
      type = itemOrNull.type;
      try { ench = itemOrNull.enchants || []; } catch (_) { ench = []; }
    }
    // 兜のエンチャ（アクアアフィニティ）も考慮
    if (headItem) {
      try { ench = ench.concat(headItem.enchants || []); } catch (_) {}
    }
    return block.digTime(type, creative, inWater, notOnGround, ench, entityEffects);
  };

  const tHand = digTimeWith(null);

  // 木材系（原木/木/幹/菌糸幹/板材/竹など）は明示優先度で斧を装備
  // 優先度: ネザライト > ダイヤ > 鉄 > 石 > 金 > 木
  try {
    const bname = String(block?.name || '').toLowerCase();
    const isWoodLike = /(log|_wood$|_stem$|hyphae|planks|bamboo|mosaic)/.test(bname);
    if (isWoodLike) {
      const axes = toolLike.filter((it) => /(^|_)axe$/.test(it.name)); // pickaxe を除外
      if (axes.length > 0) {
        axes.sort((a, b) => toolTierRank(a.name) - toolTierRank(b.name));
        const best = axes[0];
        if (best) { await bot.equip(best, 'hand'); return; }
      }
    }
  } catch (_) {}

  // 1) harvestTools がある場合: ドロップに必要。該当ツールから最速を選ぶ
  if (block.harvestTools) {
    const harvestable = toolLike.filter((it) => block.canHarvest(it.type));
    if (harvestable.length === 0) {
      throw new Error('適切なツールがありません（破壊してもアイテム化しません）');
    }
    let best = null;
    let bestT = Infinity;
    for (const it of harvestable) {
      const t = digTimeWith(it);
      if (t < bestT) { bestT = t; best = it; }
    }
    if (!best) {
      // 念のためティアで選ぶ
      harvestable.sort((a, b) => toolTierRank(a.name) - toolTierRank(b.name));
      best = harvestable[0];
    }
    await bot.equip(best, 'hand');
    return;
  }

  // 2) harvestTools が無い場合: material/name から推定しつつ、時間最小も考慮
  const mat = String(block.material || '').toLowerCase();
  let need = null;
  if (mat.includes('mineable/pickaxe')) need = 'pickaxe';
  else if (mat.includes('mineable/axe')) need = 'axe';
  else if (mat.includes('mineable/shovel')) need = 'shovel';
  else if (mat.includes('leaves') || mat.includes('coweb')) need = 'shears';
  const guess = guessToolForBlock(block);
  if (!need && guess.tool) need = guess.tool;

  let best = null;
  let bestT = tHand;
  for (const it of toolLike) {
    // 必要種別がわかっているなら種類でフィルタ
    if (need && !(it.name.includes(need) || (need === 'shears' && it.name.includes('shears')))) continue;
    const t = digTimeWith(it);
    if (t < bestT) { bestT = t; best = it; }
  }

  // ツール必須と推定される場合（石・鉱石・クモの巣など）で見つからないなら中止
  if (!best && (guess.requireForDrop || need === 'pickaxe' || need === 'shears')) {
    throw new Error('必要なツールがありません（破壊してもアイテム化しません）');
  }

  // ツールが見つかり、手より速いなら装備
  if (best && bestT + 1e-6 < tHand) {
    await bot.equip(best, 'hand');
  }
  // それ以外は素手でOK（ドロップに問題ないと推定）
};

// 在庫ユーティリティ
const invCountById = (id, meta = null) => libInvCountById(bot, id, meta);
const itemNameById = (id) => libItemNameById(mcDataGlobal, id);
const invCountByName = (name) => libInvCountByName(bot, mcDataGlobal, name);

// 自動採集: アイテム→採掘すべきブロックの簡易マッピング
const gatherSources = () => libGatherSources(mcDataGlobal);
const gatherItemByMining = async (itemName, desiredCount, opts = {}) => {
  if (!mcDataGlobal) throw new Error('データ未初期化');
  return await libGatherItemByMining(bot, mcDataGlobal, (ids, o) => findNearestBlocksByIds(ids, o), gotoBlockAndDig, itemName, desiredCount, opts);
};

// 方向ヘルパー: yawから前後左右を算出（x,z の -1/0/1）
const yawToDir = () => {
  const yaw = bot.entity.yaw; // 0 で -Z 方向
  const fx = Math.round(-Math.sin(yaw));
  const fz = Math.round(Math.cos(yaw));
  // 前
  const front = new Vec3(fx, 0, fz);
  // 右 = 前を右回転
  const right = new Vec3(-front.z, 0, front.x);
  const left = new Vec3(front.z, 0, -front.x);
  const back = new Vec3(-front.x, 0, -front.z);
  return { front, back, left, right };
};

const isAirLike = (block) => !block || block.name === 'air' || block.name?.includes('water') || block.name?.includes('lava');
const isSolid = (block) => block && block.boundingBox === 'block' && !isAirLike(block);

const findPlaceRefForTarget = (targetPos) => {
  // 置きたいセル targetPos に対し、隣接の実体ブロックを参照にクリックする
  // face は ref -> target の方向ベクトル
  const dirs = [
    new Vec3(0, -1, 0), // 下をクリックして上に置く
    new Vec3(1, 0, 0), new Vec3(-1, 0, 0),
    new Vec3(0, 0, 1), new Vec3(0, 0, -1),
    new Vec3(0, 1, 0) // 上をクリックして下に置く（最後の手段）
  ];
  for (const dir of dirs) {
    const refPos = targetPos.minus(dir);
    const refBlock = bot.blockAt(refPos);
    if (isSolid(refBlock)) {
      return { refBlock, face: dir };
    }
  }
  return null;
};

/* moved to actions/build.js */
/*
commandHandlers.set('build', ({ args, sender }) => {
  const blockName = args[0];
  const dirArg = (args[1] || 'front').toLowerCase();
  if (!blockName) {
    if (sender) bot.chat(`@${sender} 使用方法: build <blockName> [front|back|left|right|up|down|near]`);
    return;
  }
  const item = bot.inventory.items().find((i) => i.name === blockName);
  if (!item) {
    if (sender) bot.chat(`@${sender} インベントリに ${blockName} がありません`);
    return;
  }

  const { front, back, left, right } = yawToDir();
  const base = bot.entity.position.floored();
  let targetPos = null;
  let ref = null;

  const pickNear = () => {
    // 近場優先で探索（半径2）
    const cand = [];
    const ring = [
      new Vec3(1, 0, 0), new Vec3(-1, 0, 0),
      new Vec3(0, 0, 1), new Vec3(0, 0, -1),
      new Vec3(2, 0, 0), new Vec3(-2, 0, 0),
      new Vec3(0, 0, 2), new Vec3(0, 0, -2),
      new Vec3(1, 0, 1), new Vec3(1, 0, -1), new Vec3(-1, 0, 1), new Vec3(-1, 0, -1)
    ];
    for (const d of ring) {
      const tp = base.plus(d);
      const tBlock = bot.blockAt(tp);
      if (!isAirLike(tBlock)) continue;
      // 足元がしっかりしている場所を優先
      const below = bot.blockAt(tp.offset(0, -1, 0));
      if (!isSolid(below)) continue;
      const r = findPlaceRefForTarget(tp);
      if (r) return { tp, r };
      cand.push({ tp, r: null });
    }
    return null;
  };

  if (dirArg === 'near') {
    const found = pickNear();
    if (found) { targetPos = found.tp; ref = found.r; }
  } else {
    let offset = front.clone();
    if (dirArg === 'back') offset = back.clone();
    else if (dirArg === 'left') offset = left.clone();
    else if (dirArg === 'right') offset = right.clone();
    else if (dirArg === 'up') offset = new Vec3(0, 1, 0);
    else if (dirArg === 'down') offset = new Vec3(0, -1, 0);
    targetPos = base.plus(offset);
  }

  if (!targetPos) {
    if (sender) bot.chat(`@${sender} 近くに設置できる場所が見つかりません`);
    return;
  }

  const targetBlock = bot.blockAt(targetPos);
  if (!isAirLike(targetBlock)) {
    // 指定方向で不可のとき、近場サーチにフォールバック
    const found = pickNear();
    if (found) { targetPos = found.tp; ref = found.r; }
  }

  if (!ref) ref = findPlaceRefForTarget(targetPos);
  if (!ref) {
    if (sender) bot.chat(`@${sender} 参照ブロックが見つからず設置できません`);
    return;
  }

  const doPlace = async () => {
    await bot.equip(item, 'hand');
    // 近接での設置失敗を抑えるため一時的にスニーク
    bot.setControlState('sneak', true);
    try {
      await bot.placeBlock(ref.refBlock, ref.face);
    } catch (err) {
      log(`設置できませんでした: ${err.message}`);
      if (sender) bot.chat(`@${sender} 設置失敗: ${err.message}`);
    } finally {
      setTimeout(() => bot.setControlState('sneak', false), 300);
    }
  };

  doPlace();
});
*/

const normalizeChat = (text) => {
  if (!text) return '';
  // 全角→半角の最小限正規化（全角スペース・全角！）
  return text.replace(/\u3000/g, ' ').replace(/！/g, '!').trim();
};

const parseCommand = (sender, message) => {
  const trimmed = normalizeChat(message);
  if (!trimmed) return null;

  const parts = trimmed.split(/\s+/);
  let first = parts[0].toLowerCase();
  let commandParts = parts;

  // !cmd / !<botname> cmd
  if (first.startsWith('!')) {
    const token = first.substring(1);
    if (token === bot.username.toLowerCase()) {
      commandParts = parts.slice(1);
    } else {
      commandParts = [token, ...parts.slice(1)];
    }
  } else {
    // @<botname> cmd / <botname>: cmd / @<botname>: cmd
    const norm = (s) => s.replace(/[,:;]+$/, '');
    const f0 = norm(first);
    const mentions = new Set([
      `@${bot.username.toLowerCase()}`,
      bot.username.toLowerCase()
    ]);
    if (mentions.has(f0)) {
      commandParts = parts.slice(1);
    }
  }

  const command = commandParts[0]?.toLowerCase();
  const args = commandParts.slice(1);
  if (!command) return null;
  return { command, args, sender };
};

bot.on('chat', (sender, message) => {
  log(`チャット <${sender}> ${message}`);
  if (sender === bot.username) return;

  const parsed = parseCommand(sender, message);
  if (!parsed) return;

  const handler = commandHandlers.get(parsed.command);
  if (handler) {
    handler(parsed);
  } else {
    log(`未対応コマンド: ${parsed.command}`);
    try {
      bot.chat(`@${sender} 未対応コマンド: ${parsed.command} / help で一覧`);
    } catch (_) {}
  }
});

bot.on('kicked', (reason) => {
  log(`サーバーからキックされました: ${reason}`);
});

bot.on('end', (reason) => {
  log(`接続が終了しました: ${reason}`);
  stopFollowing();
});

bot.on('error', (error) => {
  log(`エラー: ${error.message}`);
});

process.on('SIGINT', () => {
  log('終了処理中...');
  bot.quit('ユーザーによる停止');
  setTimeout(() => process.exit(0), 1000);
});
// インベントリ一覧: items / inv
const summarizeInventory = () => {
  const stacks = bot.inventory.items().slice();
  try {
    if (bot.registry?.isNewerOrEqualTo?.('1.9') && bot.inventory.slots[45]) {
      stacks.push(bot.inventory.slots[45]); // off-hand
    }
  } catch (_) {}
  if (stacks.length === 0) return [];
  const totals = new Map();
  for (const it of stacks) {
    const key = it?.name || 'unknown';
    if (!it) continue;
    totals.set(key, (totals.get(key) || 0) + it.count);
  }
  return Array.from(totals.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, count]) => `${getJaItemName(name)} x${count}`);
};

const chatChunks = (parts, maxLen = 200) => {
  const chunks = [];
  let cur = '';
  for (const p of parts) {
    const add = cur ? `, ${p}` : p;
    if ((cur + add).length > maxLen) {
      if (cur) chunks.push(cur);
      cur = p;
    } else {
      cur += add;
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
};

/* moved to actions/items.js */
/*
commandHandlers.set('items', ({ sender }) => {
  const list = summarizeInventory();
  if (list.length === 0) {
    bot.chat(sender ? `@${sender} inventory: empty` : 'inventory: empty');
    return;
  }
  const lines = chatChunks(list);
  for (const line of lines) {
    bot.chat(sender ? `@${sender} ${line}` : line);
  }
});
commandHandlers.set('inv', (ctx) => commandHandlers.get('items')(ctx));
commandHandlers.set('inventory', (ctx) => commandHandlers.get('items')(ctx));
commandHandlers.set('list', (ctx) => commandHandlers.get('items')(ctx));
*/

// 体力・満腹度表示: status / hp / food
// status 系コマンドは actions に移動

/* moved to actions/help.js */
/*
commandHandlers.set('help', ({ sender }) => {
  const lines = [
    'commands: ping, come, follow, stop, jump',
    'look <dir|player|x y z> / face',
    'build <block> [front|back|left|right|up|down|near]',
    'dig <block> [count] / mine <block> [count]',
    'craft <item> [count]',
    'items|inv|inventory|list',
    'status|hp|food|ステータス|状態: 体力・満腹度を表示',
    'furnace <input|fuel|take|load> ...',
    'chest all  # 所持品を全て格納',
    'chest take <itemName> [count]',
    'perf <light|normal>  # 軽量化切替',
    'ja <enName> / jaadd <enName> <日本語> / jadel <英名>',
    'jaload / jaimport data/ja-items.(json|csv)'
  ];
  for (const l of lines) bot.chat(sender ? `@${sender} ${l}` : l);
});
*/

// 日本語名ユーティリティ
/* moved to actions/ja.js */
/*
commandHandlers.set('ja', ({ args, sender }) => {
  const en = (args[0] || '').replace(/^minecraft:/, '').toLowerCase();
  if (!en) {
    bot.chat(sender ? `@${sender} 使用方法: ja <英名>` : 'usage: ja <enName>');
    return;
  }
  bot.chat(sender ? `@${sender} ${en} → ${getJaItemName(en)}` : `${en} → ${getJaItemName(en)}`);
});

// actions の登録（look/status など）
registerActions(bot, commandHandlers, {
  yawToDir,
  getJaItemName,
  gotoBlock,
  goals,
  mcData: () => mcDataGlobal,
  log,
  startFollowing,
  stopFollowing,
  getJaDict: () => jaDict,
  saveJaDict,
  loadJaDict,
  // build/dig などで利用する共通処理
  isAirLike,
  isSolid,
  findPlaceRefForTarget,
  Vec3,
  findNearestBlockByName,
  gotoBlockAndDig,
  // craft/furnace 系
  craftWithAuto: (itemId, desiredCount, sender, depth=0) => libCraftWithAuto(bot, mcDataGlobal, {
    invCountById,
    itemNameById,
    getJaItemName,
    findNearestBlockByName,
    gotoBlock,
    smeltAuto: (out, cnt, s) => libSmeltAuto(bot, mcDataGlobal, {
      invCountById,
      invCountByName,
      gatherSources,
      gatherItemByMining,
      openOrApproachFurnace: () => libOpenOrApproachFurnace(bot, mcDataGlobal, gotoBlock),
      ensureFuelInFurnace: (f, n, s2) => libEnsureFuelInFurnace(bot, mcDataGlobal, { invCountById, gatherItemByMining }, f, n, s2),
      getJaItemName,
      smeltSources: libSmeltSources
    }, out, cnt, s),
    gatherItemByMining,
  }, itemId, desiredCount, sender, depth),
  smeltAuto: (out, cnt, s) => libSmeltAuto(bot, mcDataGlobal, {
    invCountById,
    invCountByName,
    gatherSources,
    gatherItemByMining,
    openOrApproachFurnace: () => libOpenOrApproachFurnace(bot, mcDataGlobal, gotoBlock),
    ensureFuelInFurnace: (f, n, s2) => libEnsureFuelInFurnace(bot, mcDataGlobal, { invCountById, gatherItemByMining }, f, n, s2),
    getJaItemName,
    smeltSources: libSmeltSources
  }, out, cnt, s),
  openOrApproachFurnace: () => libOpenOrApproachFurnace(bot, mcDataGlobal, gotoBlock),
  ensureFuelInFurnace: (f, n, s) => libEnsureFuelInFurnace(bot, mcDataGlobal, { invCountById, gatherItemByMining }, f, n, s),
  // perf
  setPerfMode: (v) => { perf.mode = v; }
});

commandHandlers.set('jaadd', ({ args, sender }) => {
  if (!args || args.length < 2) {
    bot.chat(sender ? `@${sender} 使用方法: jaadd <英名> <日本語名>` : 'usage: jaadd <en> <ja>');
    return;
  }
  const en = String(args[0]).replace(/^minecraft:/, '').toLowerCase();
  const ja = args.slice(1).join(' ');
  jaDict[en] = ja;
  saveJaDict().then((ok) => {
    bot.chat(sender ? `@${sender} 登録: ${en} → ${ja} ${ok ? '(保存済)' : '(保存失敗)'}` : `登録: ${en} → ${ja}`);
  });
});

commandHandlers.set('jadel', ({ args, sender }) => {
  const en = (args[0] || '').replace(/^minecraft:/, '').toLowerCase();
  if (!en) {
    bot.chat(sender ? `@${sender} 使用方法: jadel <英名>` : 'usage: jadel <en>');
    return;
  }
  if (jaDict[en]) {
    delete jaDict[en];
    saveJaDict().then((ok) => {
      bot.chat(sender ? `@${sender} 削除: ${en} ${ok ? '(保存済)' : '(保存失敗)'}` : `削除: ${en}`);
    });
  } else {
    bot.chat(sender ? `@${sender} 未登録: ${en}` : `未登録: ${en}`);
  }
});

commandHandlers.set('jaload', async ({ sender }) => {
  try {
    await loadJaDict();
    bot.chat(sender ? `@${sender} 日本語辞書を再読み込みしました（${Object.keys(jaDict).length}件）` : 'OK');
  } catch (e) {
    bot.chat(sender ? `@${sender} 失敗: ${e.message}` : `失敗: ${e.message}`);
  }
});

commandHandlers.set('jaimport', async ({ args, sender }) => {
  const rel = args[0];
  if (!rel) {
    bot.chat(sender ? `@${sender} 使用: jaimport data/ja-items.csv|json` : 'usage: jaimport data/ja-items.csv|json');
    return;
  }
  try {
    const lower = rel.toLowerCase();
    let added = 0;
    if (lower.endsWith('.json')) {
      // JSONを取り込み
      const buf = await readFile(new URL(`../${rel}`, import.meta.url));
      const obj = JSON.parse(String(buf));
      if (!obj || typeof obj !== 'object') throw new Error('JSONが不正です');
      for (const [k, v] of Object.entries(obj)) {
        if (k && v) jaDict[k] = v;
      }
      added = Object.keys(obj).length;
      await saveJaDict();
    } else if (lower.endsWith('.csv') || lower.endsWith('.tsv')) {
      // CSV/TSV取り込み（en,ja）
      const text = String(await readFile(new URL(`../${rel}`, import.meta.url)));
      const lines = text.split(/\r?\n/);
      let count = 0;
      for (const raw of lines) {
        const line = raw.trim();
        if (!line || line.startsWith('#')) continue;
        const parts = line.split(/[\t,]/);
        if (parts.length < 2) continue;
        const en = parts[0].trim().replace(/^minecraft:/, '').toLowerCase();
        const ja = parts.slice(1).join(',').trim();
        if (!en || !ja) continue;
        jaDict[en] = ja;
        count++;
      }
      await saveJaDict();
      added = count;
    } else {
      throw new Error('拡張子は .json / .csv / .tsv を指定してください');
    }
    bot.chat(sender ? `@${sender} 取り込み: ${rel} → ${added}件` : `取り込み: ${added}`);
  } catch (e) {
    bot.chat(sender ? `@${sender} 失敗: ${e.message}` : `失敗: ${e.message}`);
  }
});
*/

// かまど操作: furnace <input|fuel|take> ...
const furnaceBlockIds = () => {
  if (!mcDataGlobal) return [];
  const ids = [];
  const add = (n) => { const b = mcDataGlobal.blocksByName[n]; if (b) ids.push(b.id); };
  add('furnace'); add('lit_furnace'); // 互換
  return ids;
};

const findNearestFurnace = (maxDistance = dist.near()) => {
  const ids = furnaceBlockIds();
  if (ids.length === 0) return null;
  return bot.findBlock({ matching: ids, maxDistance });
};

const openNearestFurnace = async () => {
  let block = findNearestFurnace(dist.near());
  if (!block) {
    block = findNearestFurnace(dist.far());
    if (block) await gotoBlock(block.position);
  }
  if (!block) throw new Error('近くにかまどが見つかりません');
  const furnace = await bot.openFurnace(block);
  return furnace;
};

const pickInventoryItemByName = (name) => {
  name = String(name || '').replace(/^minecraft:/, '').toLowerCase();
  return bot.inventory.items().find((i) => i.name === name) || null;
};

// チェスト操作は actions/lib に移動

// チェスト関連は actions/lib に移動

/* moved to actions/chest.js */
/*
commandHandlers.set('chest', ({ args, sender }) => {
  if (!args || args.length === 0) {
    bot.chat(sender ? `@${sender} 使用: chest <all|take> ...` : 'usage: chest <all|take> ...');
    return;
  }
  const sub = args[0].toLowerCase();
  const rest = args.slice(1);

  const parseNameCount = (arr) => {
    const a0 = arr[0];
    const a1 = arr[1];
    const isNum0 = a0 !== undefined && !isNaN(Number(a0));
    const isNum1 = a1 !== undefined && !isNaN(Number(a1));
    const name = (isNum0 ? a1 : a0) || '';
    const count = Math.max(1, Math.min(64, Number(isNum0 ? a0 : (isNum1 ? a1 : 1))));
    return { name, count };
  };

  (async () => {
    try {
      // chest の実装は actions/chest.js に移動済み
      bot.chat(sender ? `@${sender} 使用: chest <all|take> ...` : 'usage: chest <all|take> ...');
      return;

      // chest の実装は actions/chest.js へ移動
      bot.chat(sender ? `@${sender} 使用: chest <all|take> ...` : 'usage: chest <all|take> ...');
      return;
    } catch (e) {
      bot.chat(sender ? `@${sender} 失敗: ${e.message}` : `失敗: ${e.message}`);
    }
  })();
});
*/

/* moved to actions/furnace.js */
/*
commandHandlers.set('furnace', ({ args, sender }) => {
  if (!args || args.length === 0) {
    bot.chat(sender ? `@${sender} 使用: furnace <input|fuel|take|load> ...` : 'usage: furnace <input|fuel|take|load> ...');
    return;
  }

  const sub = args[0].toLowerCase();
  const rest = args.slice(1);

  (async () => {
    try {
      const furnace = await openNearestFurnace();

      const putCommon = async (slotKind, a) => {
        // 柔軟解釈: 名前と数の順不同
        const a0 = a[0]; const a1 = a[1];
        const isNum0 = !isNaN(Number(a0));
        const isNum1 = !isNaN(Number(a1));
        const name = (isNum0 ? a1 : a0) || '';
        const count = Math.max(1, Math.min(64, Number(isNum0 ? a0 : (isNum1 ? a1 : 1))));
        const item = pickInventoryItemByName(name);
        if (!item) {
          bot.chat(sender ? `@${sender} 所持していません: ${name}` : `所持していません: ${name}`);
          furnace.close();
          return;
        }
        const fn = slotKind === 'input' ? furnace.putInput : furnace.putFuel;
        await fn.call(furnace, item.type, null, count);
        bot.chat(sender ? `@${sender} かまどに ${getJaItemName(item.name)} x${count} を投入(${slotKind})` : 'ok');
        furnace.close();
      };

      const takeCommon = async (what) => {
        const map = { input: furnace.takeInput, fuel: furnace.takeFuel, output: furnace.takeOutput };
        const fn = map[what];
        if (!fn) {
          bot.chat(sender ? `@${sender} take は input|fuel|output` : 'take: input|fuel|output');
          furnace.close();
          return;
        }
        try {
          const it = await fn.call(furnace);
          if (it) bot.chat(sender ? `@${sender} 回収: ${getJaItemName(it.name)} x${it.count}` : 'took');
          else bot.chat(sender ? `@${sender} 取り出せるアイテムがありません` : 'empty');
        } finally {
          furnace.close();
        }
      };

      // 名前と数のペアを柔軟に解釈
      const parseNameCount = (arr) => {
        const a0 = arr[0];
        const a1 = arr[1];
        const isNum0 = a0 !== undefined && !isNaN(Number(a0));
        const isNum1 = a1 !== undefined && !isNaN(Number(a1));
        const name = (isNum0 ? a1 : a0) || '';
        const count = Math.max(1, Math.min(64, Number(isNum0 ? a0 : (isNum1 ? a1 : 1))));
        const consumed = (a0 !== undefined ? 1 : 0) + (a1 !== undefined ? 1 : 0);
        return { name, count, consumed };
      };

      if (sub === 'input' || sub === 'in') {
        await putCommon('input', rest);
      } else if (sub === 'fuel') {
        await putCommon('fuel', rest);
      } else if (sub === 'put') {
        const kind = (rest[0] || '').toLowerCase();
        if (kind !== 'input' && kind !== 'fuel') {
          bot.chat(sender ? `@${sender} put は input|fuel を指定` : 'put: input|fuel');
          furnace.close();
          return;
        }
        await putCommon(kind, rest.slice(1));
      } else if (sub === 'take') {
        const what = (rest[0] || 'output').toLowerCase();
        await takeCommon(what);
      } else if (sub === 'load') {
        // 一度で input と fuel を投入
        if (!rest || rest.length === 0) {
          bot.chat(sender ? `@${sender} 使用: furnace load <inputName> [count] [fuelName] [fuelCount]` : 'usage: furnace load <inputName> [count] [fuelName] [fuelCount]');
          furnace.close();
          return;
        }
        // 入力の解釈
        const pIn = parseNameCount(rest);
        const inItem = pickInventoryItemByName(pIn.name);
        if (!inItem) {
          bot.chat(sender ? `@${sender} 所持していません: ${pIn.name}` : `所持していません: ${pIn.name}`);
          furnace.close();
          return;
        }
        await furnace.putInput(inItem.type, null, pIn.count);

        // 残りで燃料を解釈（省略時は自動確保）
        const rest2 = rest.slice(Math.max(1, pIn.consumed));
        if (rest2.length > 0) {
          const pFuel = parseNameCount(rest2);
          const fuelItem = pickInventoryItemByName(pFuel.name);
          if (!fuelItem) {
            bot.chat(sender ? `@${sender} 燃料を所持していません: ${pFuel.name}` : `燃料を所持していません: ${pFuel.name}`);
            furnace.close();
            return;
          }
          await furnace.putFuel(fuelItem.type, null, pFuel.count);
          bot.chat(sender ? `@${sender} かまどに投入: 入力 ${getJaItemName(inItem.name)} x${pIn.count}, 燃料 ${getJaItemName(fuelItem.name)} x${pFuel.count}` : 'loaded');
          furnace.close();
        } else {
          // 軽量化: 採集せず、手持ちの石炭/木炭だけを最小限投入
          try {
            const units = Math.max(1, Math.ceil(pIn.count / 8));
            const tryPutByName = async (n, need) => {
              if (need <= 0) return 0;
              const def = mcDataGlobal.itemsByName[n];
              if (!def) return 0;
              const have = invCountById(def.id, null);
              if (have <= 0) return 0;
              const put = Math.min(need, have);
              await furnace.putFuel(def.id, null, put);
              return put;
            };
            let remaining = units;
            remaining -= await tryPutByName('coal', remaining);
            if (remaining > 0) remaining -= await tryPutByName('charcoal', remaining);
            const fueled = units - remaining;
            if (sender) {
              if (fueled > 0) bot.chat(`@${sender} かまどに投入: 入力 ${getJaItemName(inItem.name)} x${pIn.count}（燃料: 石炭/木炭 x${fueled}）`);
              else bot.chat(`@${sender} かまどに投入: 入力 ${getJaItemName(inItem.name)} x${pIn.count}（燃料は手持ちに無し）`);
            }
          } finally {
            furnace.close();
          }
        }
      } else {
        bot.chat(sender ? `@${sender} 使用: furnace <input|fuel|take|load>` : 'usage: furnace <input|fuel|take|load>');
        furnace.close();
      }
    } catch (e) {
      bot.chat(sender ? `@${sender} 失敗: ${e.message}` : `失敗: ${e.message}`);
    }
  })();
});
*/

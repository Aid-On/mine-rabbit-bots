#!/usr/bin/env node
import { createBot } from 'mineflayer';
import pathfinderPlugin from 'mineflayer-pathfinder';
import minecraftData from 'minecraft-data';
import { Vec3 } from 'vec3';
import './env.js';
import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';

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
  maxDistance = 32,
  count = 1
} = {}) => {
  if (!mcDataGlobal) return [];
  const def = mcDataGlobal.blocksByName[name];
  if (!def) return [];
  const positions = bot.findBlocks({ matching: def.id, maxDistance, count: Math.max(1, count) });
  // Sort by distance (nearest first)
  positions.sort((a, b) => a.distanceTo(bot.entity.position) - b.distanceTo(bot.entity.position));
  return positions;
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

commandHandlers.set('ping', () => {
  bot.chat('pong');
});

commandHandlers.set('come', ({ sender }) => {
  const player = bot.players[sender];
  if (player?.entity) {
    const { x, y, z } = player.entity.position;
    if (bot.pathfinder?.setGoal) {
      bot.pathfinder.setGoal(new goals.GoalNear(x, y, z, 1));
    }
  }
});

commandHandlers.set('follow', ({ sender }) => {
  log(`フォロー開始: ${sender}`);
  startFollowing(sender);
});

commandHandlers.set('stop', () => {
  log('フォローを停止します');
  stopFollowing();
});

commandHandlers.set('jump', () => {
  bot.setControlState('jump', true);
  setTimeout(() => bot.setControlState('jump', false), 500);
});

commandHandlers.set('dig', ({ args, sender }) => {
  // 使い方:
  // - `dig` : 目の前(または足元)の1ブロックだけ掘る（従来動作）
  // - `dig <blockName> [count]` : 指定ブロックを近場から count 個掘る
  if (!args || args.length === 0) {
    // 従来の「前方/足元の1ブロックを掘る」動作は一旦停止
    // const block = bot.blockAtCursor(5) || bot.blockAt(bot.entity.position.offset(0, -1, 0));
    // if (block && block.name !== 'air') {
    //   bot.dig(block).catch((err) => log(`掘れませんでした: ${err.message}`));
    // }
    if (sender) bot.chat(`@${sender} 使用方法: dig <blockName> [count]`);
    return;
  }

  // 柔軟な引数解釈: `dig stone 5` も `dig 5 stone` も許可
  const a0 = String(args[0]).toLowerCase();
  const a1 = args[1] !== undefined ? String(args[1]).toLowerCase() : undefined;
  const a0num = Number(a0);
  const a1num = a1 !== undefined ? Number(a1) : NaN;
  let blockName = isNaN(a0num) ? a0 : a1 ?? '';
  let count = !isNaN(a0num) ? a0num : (!isNaN(a1num) ? a1num : 1);

  // 名前整形: `minecraft:stone` → `stone`, 空白→`_`
  blockName = blockName.replace(/^minecraft:/, '').replace(/\s+/g, '_');
  count = Math.max(1, Math.min(64, Number(count)));
  (async () => {
    if (!mcDataGlobal) {
      log('データ未初期化のため、後で再度お試しください');
      return;
    }
    const def = mcDataGlobal.blocksByName[blockName];
    if (!def) {
      log(`不明なブロック名: ${blockName}`);
      bot.chat(`@${sender} 不明なブロック名: ${blockName}`);
      return;
    }
    bot.chat(`@${sender} ${blockName} を ${count} 個掘ります`);
    let mined = 0;
    for (let i = 0; i < count; i++) {
      const [pos] = findNearestBlockByName(blockName, { maxDistance: 48, count: 1 });
      if (!pos) {
        log(`近くに ${blockName} が見つかりませんでした（進捗 ${mined}/${count}）`);
        bot.chat(`@${sender} 近くに ${blockName} が見つかりません`);
        break;
      }
      try {
        await gotoBlockAndDig(pos);
        mined += 1;
        log(`${blockName} を掘りました。進捗: ${mined}/${count}`);
      } catch (err) {
        log(`掘削に失敗: ${err.message}`);
        bot.chat(`@${sender} 掘削に失敗: ${err.message}`);
        break;
      }
    }
    if (mined === count) bot.chat(`@${sender} 掘削完了: ${blockName} x${count}`);
  })();
});

// エイリアス: `mine` でも同じ動作
commandHandlers.set('mine', (ctx) => commandHandlers.get('dig')(ctx));

// クラフト: craft <itemName> [count]
commandHandlers.set('craft', ({ args, sender }) => {
  if (!mcDataGlobal) {
    if (sender) bot.chat(`@${sender} データ未初期化です。少し待ってから再試行してください`);
    return;
  }

  if (!args || args.length === 0) {
    if (sender) bot.chat(`@${sender} 使用方法: craft <itemName> [count]`);
    return;
  }

  // 柔軟な引数解釈: `craft stick 8` も `craft 8 stick` も許可
  const a0 = String(args[0]).toLowerCase();
  const a1 = args[1] !== undefined ? String(args[1]).toLowerCase() : undefined;
  const a0num = Number(a0);
  const a1num = a1 !== undefined ? Number(a1) : NaN;
  let itemName = isNaN(a0num) ? a0 : (a1 ?? '');
  let desiredCount = !isNaN(a0num) ? a0num : (!isNaN(a1num) ? a1num : 1);

  itemName = itemName.replace(/^minecraft:/, '').replace(/\s+/g, '_');
  desiredCount = Math.max(1, Math.min(64, Number(desiredCount)));

  const itemDef = mcDataGlobal.itemsByName[itemName];
  if (!itemDef) {
    log(`不明なアイテム名: ${itemName}`);
    if (sender) bot.chat(`@${sender} 不明なアイテム: ${itemName}`);
    return;
  }

  (async () => {
    try {
      // 近距離の作業台のみ使用（パス移動はしない）
      const tablePos = findNearestBlockByName('crafting_table', { maxDistance: 6, count: 1 })[0];
      let craftingTableBlock = null;
      if (tablePos && tablePos.distanceTo(bot.entity.position) <= 5.5) {
        craftingTableBlock = bot.blockAt(tablePos);
      }

      // 現在在庫で作成可能なレシピのみ使用（依存クラフトはしない）
      let recipe = bot.recipesFor(itemDef.id, null, desiredCount, craftingTableBlock)[0];
      if (!recipe && craftingTableBlock) {
        // テーブルでは不可なら、インベントリレシピも試す
        recipe = bot.recipesFor(itemDef.id, null, desiredCount, null)[0];
      }
      if (!recipe) {
        if (sender) bot.chat(`@${sender} クラフト不可（材料不足か作業台が遠い）`);
        return;
      }

      const per = recipe.result?.count || 1;
      const times = Math.max(1, Math.ceil(desiredCount / per));
      if (sender) bot.chat(`@${sender} ${itemName} を ${desiredCount} 個クラフトします`);

      let made = 0;
      for (let i = 0; i < times; i++) {
        try {
          await bot.craft(recipe, 1, recipe.requiresTable ? (craftingTableBlock || null) : null);
          made += per;
        } catch (err) {
          log(`クラフト失敗: ${err.message}`);
          break;
        }
      }

      if (made > 0) {
        const finalCount = Math.min(made, desiredCount);
        if (sender) bot.chat(`@${sender} クラフト完了: ${itemName} x${finalCount}`);
      } else {
        if (sender) bot.chat(`@${sender} クラフトできませんでした`);
      }
    } catch (e) {
      log(`クラフト処理エラー: ${e.message}`);
      if (sender) bot.chat(`@${sender} エラー: ${e.message}`);
    }
  })();
});

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

commandHandlers.set('build', ({ args, sender }) => {
  const blockName = args[0];
  const dirArg = (args[1] || 'front').toLowerCase();
  if (!blockName) {
    if (sender) bot.chat(`@${sender} 使用方法: build <blockName> [front|back|left|right]`);
    return;
  }
  const item = bot.inventory.items().find((i) => i.name === blockName);
  if (!item) {
    if (sender) bot.chat(`@${sender} インベントリに ${blockName} がありません`);
    return;
  }

  const { front, back, left, right } = yawToDir();
  const base = bot.entity.position.floored();
  let offset = front.clone();
  if (dirArg === 'back') offset = back.clone();
  else if (dirArg === 'left') offset = left.clone();
  else if (dirArg === 'right') offset = right.clone();
  else if (dirArg === 'up') offset = new Vec3(0, 1, 0);
  else if (dirArg === 'down') offset = new Vec3(0, -1, 0);

  const targetPos = base.plus(offset);
  const targetBlock = bot.blockAt(targetPos);
  if (!isAirLike(targetBlock)) {
    log(`目標位置が空いていません: ${targetBlock?.name}`);
    if (sender) bot.chat(`@${sender} その方向は既に埋まっています`);
    return;
  }

  const ref = findPlaceRefForTarget(targetPos);
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

const normalizeChat = (text) => {
  if (!text) return '';
  // 全角→半角の最小限正規化（全角スペース・全角！）
  return text.replace(/\u3000/g, ' ').replace(/！/g, '!').trim();
};

const parseCommand = (sender, message) => {
  const trimmed = normalizeChat(message);
  if (!trimmed) return null;

  const parts = trimmed.split(/\s+/);
  const first = parts[0].toLowerCase();
  let commandParts = parts;

  if (first.startsWith('!')) {
    const token = first.substring(1);
    if (token === bot.username.toLowerCase()) {
      // pattern: !<botname> cmd ...
      commandParts = parts.slice(1);
    } else {
      // pattern: !cmd ...  → treat as command with bang prefix
      commandParts = [token, ...parts.slice(1)];
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

commandHandlers.set('help', ({ sender }) => {
  const lines = [
    'commands: ping, come, follow, stop, jump',
    'build <block> [front|back|left|right|up|down]',
    'dig <block> [count] / mine <block> [count]',
    'craft <item> [count]',
    'items|inv|inventory|list',
    'ja <enName> / jaadd <enName> <日本語> / jadel <enName>'
  ];
  for (const l of lines) bot.chat(sender ? `@${sender} ${l}` : l);
});

// 日本語名ユーティリティ
commandHandlers.set('ja', ({ args, sender }) => {
  const en = (args[0] || '').replace(/^minecraft:/, '').toLowerCase();
  if (!en) {
    bot.chat(sender ? `@${sender} 使用方法: ja <英名>` : 'usage: ja <enName>');
    return;
  }
  bot.chat(sender ? `@${sender} ${en} → ${getJaItemName(en)}` : `${en} → ${getJaItemName(en)}`);
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

// かまど操作: furnace <input|fuel|take> ...
const furnaceBlockIds = () => {
  if (!mcDataGlobal) return [];
  const ids = [];
  const add = (n) => { const b = mcDataGlobal.blocksByName[n]; if (b) ids.push(b.id); };
  add('furnace'); add('lit_furnace'); // 互換
  return ids;
};

const findNearestFurnace = (maxDistance = 6) => {
  const ids = furnaceBlockIds();
  if (ids.length === 0) return null;
  return bot.findBlock({ matching: ids, maxDistance });
};

const openNearestFurnace = async () => {
  let block = findNearestFurnace(6);
  if (!block) {
    block = findNearestFurnace(48);
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

commandHandlers.set('furnace', ({ args, sender }) => {
  if (!args || args.length === 0) {
    bot.chat(sender ? `@${sender} 使用: furnace <input|fuel|take> ...` : 'usage: furnace <input|fuel|take> ...');
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
      } else {
        bot.chat(sender ? `@${sender} 使用: furnace <input|fuel|take>` : 'usage: furnace <input|fuel|take>');
        furnace.close();
      }
    } catch (e) {
      bot.chat(sender ? `@${sender} 失敗: ${e.message}` : `失敗: ${e.message}`);
    }
  })();
});

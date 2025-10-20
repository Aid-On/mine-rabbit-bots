// チェスト操作のビジネスロジック（testable）
import { sleep } from './utils.js';

/**
 * チェストの状態を分析
 * @param {Object} chest - チェストオブジェクト
 * @returns {Object} { totalSlots, emptySlots, chestSlots, stackableSpace }
 */
export function analyzeChest(chest) {
  const chestSlots = [];

  try {
    if (typeof chest.containerItems === 'function') {
      chestSlots.push(...chest.containerItems());
    } else if (typeof chest.items === 'function') {
      chestSlots.push(...chest.items());
    } else if (chest.window?.slots) {
      const containerStart = chest.window.inventoryStart || 0;
      const containerEnd = chest.window.inventoryEnd || chest.window.slots.length;
      for (let i = containerStart; i < containerEnd; i++) {
        const slot = chest.window.slots[i];
        if (slot) chestSlots.push(slot);
      }
    }
  } catch (err) {
    console.error('チェスト分析エラー:', err.message);
  }

  const totalSlots = chest.window?.slots ?
    (chest.window.inventoryEnd - chest.window.inventoryStart) : 27;
  const emptySlots = totalSlots - chestSlots.length;

  // アイテムタイプごとの最大スタック可能数を集計
  const stackableSpace = new Map();
  for (const slot of chestSlots) {
    const maxStack = slot.stackSize || 64;
    const remaining = maxStack - slot.count;
    if (remaining > 0) {
      const current = stackableSpace.get(slot.type) || 0;
      stackableSpace.set(slot.type, current + remaining);
    }
  }

  return { totalSlots, emptySlots, chestSlots, stackableSpace };
}

/**
 * 除外するスロットを取得
 * @param {Object} bot - botオブジェクト
 * @returns {Set<number>} 除外スロット番号のセット
 */
export function getExcludedSlots(bot) {
  const excluded = new Set();

  if (bot.heldItem?.slot != null) {
    excluded.add(bot.heldItem.slot);
  }

  const equipSlots = ['head', 'torso', 'legs', 'feet'];
  for (const slot of equipSlots) {
    try {
      const slotNum = bot.getEquipmentDestSlot?.(slot);
      if (slotNum != null) excluded.add(slotNum);
    } catch (_) {}
  }

  if (bot.inventory?.slots?.[45]) {
    excluded.add(45);
  }

  return excluded;
}

/**
 * アイテムを優先度順にソート
 * @param {Array} items - アイテムリスト
 * @param {Map} stackableSpace - スタック可能スペース
 * @returns {Array} ソート済みアイテムリスト
 */
export function sortItemsByPriority(items, stackableSpace) {
  return items.sort((a, b) => {
    const aStackable = stackableSpace.get(a.type) || 0;
    const bStackable = stackableSpace.get(b.type) || 0;
    return bStackable - aStackable;
  });
}

/**
 * チェストにアイテムを格納（1つ）
 * @param {Object} params - パラメータ
 * @returns {Object} { success, moved, error }
 */
export async function depositItem({ bot, chest, item, log }) {
  const countBefore = item.count;
  const slotId = item.slot;

  // チェストの状態を検証
  if (!chest || !chest.window) {
    return { success: false, moved: 0, error: 'chest is closed or invalid' };
  }

  // bot.inventory経由でアイテムを取得
  const sourceItem = bot.inventory.slots[slotId];
  if (!sourceItem) {
    return { success: false, moved: 0, error: `スロット${slotId}が空` };
  }

  log?.(`    [DEBUG] Attempting deposit: ${item.name} from slot ${slotId}, type=${sourceItem.type}, count=${sourceItem.count}`);
  log?.(`    [DEBUG] Window info: inventoryStart=${chest.window.inventoryStart}, inventoryEnd=${chest.window.inventoryEnd}`);

  try {
    // bot.putAway()を使用 - これはスロット番号ではなくスロットIDで動作する
    await bot.putAway(slotId);
    await sleep(300);

    // 格納後の確認
    const updatedItems = bot.inventory.items();
    const updatedItem = updatedItems.find(i => i.slot === slotId);
    const countAfter = updatedItem ? updatedItem.count : 0;
    const actualMoved = countBefore - countAfter;

    log?.(`    [DEBUG] After putAway: ${countBefore} → ${countAfter} (moved: ${actualMoved})`);

    return {
      success: actualMoved > 0,
      moved: actualMoved,
      deposited: actualMoved > 0
    };
  } catch (err) {
    log?.(`    [ERROR] depositItem ${item.name}: ${err.message}`);
    log?.(`    [ERROR] Stack trace: ${err.stack}`);
    return { success: false, moved: 0, error: err.message };
  }
}

/**
 * チェストに全アイテムを格納（メイン処理）
 * @param {Object} params - パラメータ
 * @returns {Object} { totalMoved, totalSkipped }
 */
export async function depositAllItems({ bot, chest, getJaItemName, log }) {
  let totalMoved = 0;
  let totalSkipped = 0;

  // 最大5回ループ
  for (let round = 1; round <= 5; round++) {
    // チェストの状態を分析
    const chestInfo = analyzeChest(chest);
    log?.(`ラウンド${round}: チェスト状態 - 空き${chestInfo.emptySlots}/${chestInfo.totalSlots}スロット`);

    // 空きスロットが0なら終了
    if (chestInfo.emptySlots === 0 && chestInfo.stackableSpace.size === 0) {
      log?.('チェストが完全に満杯です');
      break;
    }

    const excludedSlots = getExcludedSlots(bot);
    const items = bot.inventory.items().filter(item => !excludedSlots.has(item.slot));

    if (items.length === 0) {
      log?.('インベントリが空です');
      break;
    }

    log?.(`${items.length}種類のアイテムを処理`);
    let roundMoved = 0;
    let roundSkipped = 0;

    // アイテムを優先度順にソート
    const sortedItems = sortItemsByPriority(items, chestInfo.stackableSpace);

    for (const item of sortedItems) {
      // スタック可能スペースまたは空きスロットがあるかチェック
      const stackableSpace = chestInfo.stackableSpace.get(item.type) || 0;
      const canDeposit = stackableSpace > 0 || chestInfo.emptySlots > 0;

      if (!canDeposit) {
        log?.(`  ⊗ ${getJaItemName(item.name)} x${item.count} - チェストに空きなし`);
        roundSkipped++;
        continue;
      }

      const result = await depositItem({ bot, chest, item, log });

      if (result.success) {
        log?.(`  ✓ ${getJaItemName(item.name)} x${result.moved} を格納`);
        roundMoved += result.moved;

        // チェスト情報を更新
        if (stackableSpace > 0) {
          const newStackable = Math.max(0, stackableSpace - result.moved);
          chestInfo.stackableSpace.set(item.type, newStackable);
        } else {
          chestInfo.emptySlots = Math.max(0, chestInfo.emptySlots - 1);
        }
      } else {
        log?.(`  - ${getJaItemName(item.name)} は格納できませんでした`);
        roundSkipped++;
      }
    }

    totalMoved += roundMoved;
    totalSkipped += roundSkipped;

    log?.(`ラウンド${round}完了: 格納${roundMoved}個, スキップ${roundSkipped}個`);

    // このラウンドで何も格納できなければ終了
    if (roundMoved === 0) {
      log?.('これ以上格納できません');
      break;
    }

    await sleep(300);
  }

  return { totalMoved, totalSkipped };
}

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

  // 手に持っているアイテムは除外（他アクションと競合しやすい／装備中のため）
  try {
    if (bot.heldItem?.slot != null) excluded.add(bot.heldItem.slot);
  } catch (_) {}

  // 装備品は除外（頭・胴・脚・足）
  const equipSlots = ['head', 'torso', 'legs', 'feet'];
  for (const slot of equipSlots) {
    try {
      const slotNum = bot.getEquipmentDestSlot?.(slot);
      if (slotNum != null) excluded.add(slotNum);
    } catch (_) {}
  }

  // オフハンドは除外
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
  // 同じタイプの所持数を合算して前後差で移動個数を推定
  const sumCountByType = (type) => (bot.inventory.items() || [])
    .filter((it) => it && it.type === type)
    .reduce((a, b) => a + (b.count || 0), 0);

  const before = sumCountByType(item.type);
  let moved = 0;
  try {
    const desired = Math.max(1, item.count || 1);
    let remaining = desired;
    let lastProgress = -1;
    // 小分けにして投入（スタック不可や部分投入に対応）
    for (let tries = 0; tries < 6 && remaining > 0; tries++) {
      const chunk = Math.min(remaining, 32);
      try {
        await chest.deposit(item.type, item.metadata ?? null, chunk);
      } catch (_) {
        break; // deposit不可 → ループ離脱
      }
      await sleep(80);
      const now = sumCountByType(item.type);
      const diff = Math.max(0, before - now) - moved;
      if (diff <= 0) {
        if (lastProgress === 0) break; // 連続で進捗なし → 打ち切り
        lastProgress = 0;
      } else {
        moved += diff;
        remaining = Math.max(0, desired - moved);
        lastProgress = diff;
      }
    }
  } catch (err) {
    // deposit が例外で落ちた場合は下のフォールバックへ
  }
  if (moved === 0) {
    // フォールバック: シフトクリックで移動を試みる
    try {
      const win = bot.currentWindow;
      if (!win) throw new Error('no window');
      const src = (bot.inventory.items() || []).find((it) => it && it.type === item.type);
      if (!src || typeof src.slot !== 'number') throw new Error('no src');
      const invStart = win.inventoryStart ?? (win.slots.length - 36);
      const invEnd = win.inventoryEnd ?? win.slots.length;
      const hotbarStart = invEnd - 9;
      let windowSlot = null;
      if (src.slot >= 9 && src.slot <= 35) windowSlot = invStart + (src.slot - 9);
      else if (src.slot >= 36 && src.slot <= 44) windowSlot = hotbarStart + (src.slot - 36);
      if (windowSlot != null) {
        await bot.clickWindow(windowSlot, 0, 1);
        await sleep(160);
        const now = sumCountByType(item.type);
        moved = Math.max(0, before - now);
      }
    } catch (_) {
      // noop: movedは0のまま
    }
  }
  return { success: moved > 0, moved, deposited: moved > 0 };
}

/**
 * チェストに全アイテムを格納（メイン処理）
 * @param {Object} params - パラメータ
 * @returns {Object} { totalMoved, totalSkipped }
 */
export async function depositAllItems({ bot, chest, getJaItemName, log }) {
  let totalMoved = 0;
  let totalSkipped = 0;
  const failCounts = new Map(); // type -> failures

  // 最大5回ループ
  for (let round = 1; round <= 5; round++) {
    // チェストの状態を分析
    let chestInfo = analyzeChest(chest);
    log?.(`ラウンド${round}: チェスト状態 - 空き${chestInfo.emptySlots}/${chestInfo.totalSlots}スロット`);

    // 空きスロットが0なら終了
    if (chestInfo.emptySlots === 0 && chestInfo.stackableSpace.size === 0) {
      log?.('チェストが完全に満杯です');
      break;
    }

    const excludedSlots = getExcludedSlots(bot);
    const allItems = bot.inventory.items();
    const items = allItems.filter(item => !excludedSlots.has(item.slot));

    console.error(`[DEBUG] Round ${round}:`);
    console.error(`[DEBUG]   All inventory items: ${allItems.length}`);
    allItems.forEach(item => {
      console.error(`[DEBUG]     Slot ${item.slot}: ${item.name} x${item.count}`);
    });
    console.error(`[DEBUG]   Excluded slots: ${Array.from(excludedSlots).join(', ')}`);
    console.error(`[DEBUG]   Items after filtering: ${items.length}`);

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
      // 同タイプが繰り返し失敗しているならスキップ
      const f = failCounts.get(item.type) || 0;
      if (f >= 2) { continue; }
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
        log?.(`  ✓ ${getJaItemName(item.name)} を格納`);
        roundMoved++;
        // 成功したら状態を更新
        chestInfo = analyzeChest(chest);
        failCounts.delete(item.type);
      } else {
        log?.(`  - ${getJaItemName(item.name)} は格納できませんでした`);
        roundSkipped++;
        failCounts.set(item.type, f + 1);
      }
    }

    totalMoved += roundMoved;
    totalSkipped += roundSkipped;

    log?.(`ラウンド${round}完了`);

    // このラウンドで何も格納できなければ終了
    if (roundMoved === 0) {
      break;
    }

    await sleep(300);
  }

  return { totalMoved, totalSkipped };
}

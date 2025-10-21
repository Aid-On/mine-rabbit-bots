// チェスト操作のビジネスロジック（testable）
import { sleep } from './utils.js';

/**
 * Ensure the cursor (selected item) is cleared by placing it into chest first,
 * then into player's inventory if needed. Returns true if cleared or nothing to clear.
 */
export async function ensureCursorCleared({ bot, chest, log }) {
  try {
    const window = bot.currentWindow;
    // 必要条件: 現在何らかのウィンドウが開いていること（チェストが望ましい）
    if (!window) return false;

    const selected = window.selectedItem;
    if (!selected) return true; // Nothing to clear

    const slots = window.slots || [];
    const invStart = window.inventoryStart ?? 27;
    const invEnd = Math.min(invStart + 27, slots.length); // main inventory end (exclusive)
    const total = slots.length || 63;

    const isSameStack = (a, b) => a && b && a.type === b.type && (a.metadata ?? null) === (b.metadata ?? null);

    // 1) Try chest container area first: [0, invStart)
    for (let i = 0; i < invStart; i++) {
      const slot = slots[i];
      if (!slot || isSameStack(slot, selected) && slot.count < (slot.stackSize || 64)) {
        try {
          await bot.clickWindow(i, 0, 0); // place carried item here
          await sleep(80);
          if (!window.selectedItem) return true;
        } catch (_) {}
      }
    }

    // 2) Try player main inventory area: [invStart, invEnd)
    for (let i = invStart; i < invEnd; i++) {
      const slot = slots[i];
      if (!slot || isSameStack(slot, selected) && slot.count < (slot.stackSize || 64)) {
        try {
          await bot.clickWindow(i, 0, 0);
          await sleep(80);
          if (!window.selectedItem) return true;
        } catch (_) {}
      }
    }

    // 3) Try hotbar and the rest: [invEnd, total)
    for (let i = invEnd; i < total; i++) {
      const slot = slots[i];
      if (!slot || isSameStack(slot, selected) && slot.count < (slot.stackSize || 64)) {
        try {
          await bot.clickWindow(i, 0, 0);
          await sleep(80);
          if (!window.selectedItem) return true;
        } catch (_) {}
      }
    }

    log?.('カーソルのクリアに失敗: 置き場所がありません');
    return false;
  } catch (err) {
    return false;
  }
}

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
      // Container area is [0, inventoryStart)
      const containerEnd = chest.window.inventoryStart || 0;
      for (let i = 0; i < containerEnd; i++) {
        const slot = chest.window.slots[i];
        if (slot) chestSlots.push(slot);
      }
    }
  } catch (err) {
    console.error('チェスト分析エラー:', err.message);
  }

  // Total container slots are inventoryStart (index of first player inventory slot)
  const totalSlots = chest.window?.slots ? (chest.window.inventoryStart || 27) : 27;
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

  // 手に持っているアイテムも格納対象に含める（除外しない）
  // if (bot.heldItem?.slot != null) {
  //   excluded.add(bot.heldItem.slot);
  // }

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
  const countBefore = item.count;
  const slotId = item.slot;

  // Validate window state
  const window = bot.currentWindow;
  if (!window) {
    return { success: false, moved: 0, error: 'No window open' };
  }
  if (chest && chest.window && window !== chest.window) {
    return { success: false, moved: 0, error: 'No window open' };
  }

  // bot.inventory経由でアイテムを取得
  const sourceItem = bot.inventory.slots[slotId];
  if (!sourceItem) {
    return { success: false, moved: 0, error: `スロット${slotId}が空` };
  }

  // Clear any carried item first to avoid broken shift-click behavior
  const preCleared = await ensureCursorCleared({ bot, chest, log });
  if (!preCleared) {
    return { success: false, moved: 0, error: 'cannot clear cursor' };
  }
  try {
    // If the item is in the currently selected hotbar slot, temporarily switch selection
    try {
      const qb = (typeof bot.quickBarSlot === 'number') ? bot.quickBarSlot : null;
      let hotbarIdx = null;
      if (slotId >= 36 && slotId <= 44) hotbarIdx = slotId - 36;
      else if (slotId >= 0 && slotId <= 8) hotbarIdx = slotId;
      if (qb != null && hotbarIdx != null && qb === hotbarIdx) {
        const slots = bot.inventory?.slots || [];
        let target = null;
        for (let i = 0; i < 9; i++) {
          if (i === qb) continue;
          const s = slots[36 + i];
          if (!s) { target = i; break; }
        }
        if (target == null) target = (qb + 1) % 9;
        if (typeof bot.setQuickBarSlot === 'function') {
          bot.setQuickBarSlot(target);
          await sleep(120);
        }
      }
    } catch (_) {}

    // Measure total items of this type in inventory BEFORE (type-level; metadata can vary in modern MC)
    const totalOfTypeBefore = (() => {
      try {
        const list = typeof bot.inventory.items === 'function' ? bot.inventory.items() : [];
        return list.filter(i => i && i.type === item.type).reduce((a, b) => a + (b.count || 0), 0);
      } catch (_) { return 0; }
    })();
    // Debug window layout
    try {
      const dbgSlotsLen = window.slots?.length ?? -1;
      const dbgInvStart = window.inventoryStart;
      const dbgInvEnd = window.inventoryEnd;
      console.error(`[DEPOSIT][DBG] item=${item.name} slotId=${slotId} invStart=${dbgInvStart} invEnd=${dbgInvEnd} slotsLen=${dbgSlotsLen}`);
    } catch (_) {}
    // まずはAPIの deposit を優先的に使用（ウィンドウレイアウト差異に強い）
    if (chest && typeof chest.deposit === 'function') {
      const meta = sourceItem.metadata ?? null;
      const listNow = typeof bot.inventory.items === 'function' ? bot.inventory.items() : [];
      const totalBeforeType = listNow.filter(i => i && i.type === sourceItem.type && (i.metadata ?? null) === meta)
                                    .reduce((a, b) => a + (b.count || 0), 0);
      try {
        await chest.deposit(sourceItem.type, meta, countBefore);
        await sleep(150);
        const listAfter = typeof bot.inventory.items === 'function' ? bot.inventory.items() : [];
        const totalAfterType = listAfter.filter(i => i && i.type === sourceItem.type && (i.metadata ?? null) === meta)
                                       .reduce((a, b) => a + (b.count || 0), 0);
        const movedApi = Math.max(0, totalBeforeType - totalAfterType);
        if (movedApi > 0) {
          if (window.selectedItem) await ensureCursorCleared({ bot, chest, log });
          return { success: true, moved: movedApi, deposited: true };
        }
        // depositが無音失敗した場合はフォールバックへ
      } catch (e) {
        // API失敗時はフォールバックへ
      }
    }

    // Convert inventory slot to window slot using window indices
    let sourceWindowSlot;
    const invStart = window.inventoryStart ?? 27; // first player inventory slot in window
    const mainInvSize = 27; // player's main inventory slots count is always 27
    const hotbarSize = 9;
    const invEnd = invStart + mainInvSize; // end of main inventory (exclusive)
    const hotbarStart = invEnd; // hotbar starts right after main inventory in window
    if (slotId >= 9 && slotId <= 35) {
      // Main inventory 9-35
      sourceWindowSlot = invStart + (slotId - 9);
    } else if (slotId >= 36 && slotId <= 44) {
      // Hotbar 36-44
      sourceWindowSlot = hotbarStart + (slotId - 36);
    } else if (slotId >= 0 && slotId < 9) {
      // Hotbar 0-8 variant
      sourceWindowSlot = hotbarStart + slotId;
    } else {
      return { success: false, moved: 0, error: `無効なスロット: ${slotId}` };
    }
    console.error(`[DEPOSIT][DBG] item=${item.name} srcWinSlot=${sourceWindowSlot} hotbarStart=${hotbarStart}`);

    const preferManual = false; // 常にAPI→クリック→手動の順にフォールバック

    // 1) Always try API deposit first (mineflayer handles edge cases)
    if (chest && typeof chest.deposit === 'function') {
      try {
        await chest.deposit(item.type, item.metadata ?? null, countBefore);
        await sleep(240);
      } catch (_) {}
    }

    // 2) Shift-click transfer
    await bot.clickWindow(sourceWindowSlot, 0, 1);
    await sleep(240);

    // Check result
    let updatedSlot = window.slots[sourceWindowSlot];
    let countAfter = updatedSlot ? updatedSlot.count : 0;
    let actualMoved = Math.max(0, countBefore - countAfter);

    // Fallback/manual path
    if (actualMoved === 0) {
      const invStart = window.inventoryStart ?? 27;
      const invEnd = window.inventoryEnd ?? 54;
      const slots = window.slots || [];
      const isSameStack = (a, b) => a && b && a.type === b.type && (a.metadata ?? null) === (b.metadata ?? null);

      // 3) Try moveSlotItem directly to an empty chest slot
      let dest = -1;
      for (let i = 0; i < invStart; i++) { if (!slots[i]) { dest = i; break; } }
      if (dest !== -1 && typeof bot.moveSlotItem === 'function') {
        try {
          await bot.moveSlotItem(sourceWindowSlot, dest);
          await sleep(260);
          const listAfter = typeof bot.inventory.items === 'function' ? bot.inventory.items() : [];
          const totalAfterTypeTry = listAfter.filter(i => i && i.type === item.type).reduce((a, b) => a + (b.count || 0), 0);
          if (totalAfterTypeTry < totalOfTypeBefore) {
            // moved
            const movedTotal = totalOfTypeBefore - totalAfterTypeTry;
            if (window.selectedItem) await ensureCursorCleared({ bot, chest, log });
            return { success: true, moved: movedTotal, deposited: true };
          }
        } catch (_) {}
      }

      // 2) pick up from source and place
      await bot.clickWindow(sourceWindowSlot, 0, 0);
      await sleep(120);

      const selected = window.selectedItem;
      if (!selected) {
        // pickup failed — abort
        await ensureCursorCleared({ bot, chest, log });
        return { success: false, moved: 0, error: 'pickup failed' };
      }

      // find destination in chest area (0 .. invStart-1)
      dest = -1;
      // prefer stackable
      for (let i = 0; i < invStart; i++) {
        const s = slots[i];
        if (s && isSameStack(s, selected) && s.count < (s.stackSize || 64)) { dest = i; break; }
      }
      if (dest === -1) {
        // empty slot
        for (let i = 0; i < invStart; i++) { if (!slots[i]) { dest = i; break; } }
      }
      if (dest === -1) {
        // nowhere to place
        await ensureCursorCleared({ bot, chest, log });
        return { success: false, moved: 0, error: 'chest is full' };
      }

      if (dest !== -1) {
        // 3) place into chest
        await bot.clickWindow(dest, 0, 0);
        await sleep(260);
      }

      // 4) As a last attempt, try API deposit again for single-count items
      try {
        await chest?.deposit?.(item.type, item.metadata ?? null, 1);
        await sleep(240);
      } catch (_) {}

      // 4) measure moved
      updatedSlot = window.slots[sourceWindowSlot];
      countAfter = updatedSlot ? updatedSlot.count : 0;
      actualMoved = Math.max(0, countBefore - countAfter);
    }

    // Ensure cursor cleared
    if (window.selectedItem) await ensureCursorCleared({ bot, chest, log });

    // Re-measure total items of this type AFTER to verify real movement (not just slot shuffle)
    const totalOfTypeAfter = (() => {
      try {
        const list = typeof bot.inventory.items === 'function' ? bot.inventory.items() : [];
        return list.filter(i => i && i.type === item.type).reduce((a, b) => a + (b.count || 0), 0);
      } catch (_) { return 0; }
    })();
    const movedTotal = Math.max(0, totalOfTypeBefore - totalOfTypeAfter);

    return { success: movedTotal > 0, moved: movedTotal, deposited: movedTotal > 0 };
  } catch (err) {
    return { success: false, moved: 0, error: err.message };
  }
}

/**
 * チェストに全アイテムを格納（メイン処理）
 * @param {Object} params - パラメータ
 * @returns {Object} { totalMoved, totalSkipped }
 */
export async function depositAllItems({ bot, chest, getJaItemName, log, maxRounds = 50 }) {
  let totalMoved = 0;
  let totalSkipped = 0;

  // 在庫が尽きるか進捗が止まるまで最大 maxRounds 反復
  for (let round = 1; round <= maxRounds; round++) {
    // チェストの状態を分析
    const chestInfo = analyzeChest(chest);
    log?.(`ラウンド${round}: チェスト状態 - 空き${chestInfo.emptySlots}/${chestInfo.totalSlots}スロット`);

    // 空きスロットが0なら終了
    if (chestInfo.emptySlots === 0 && chestInfo.stackableSpace.size === 0) {
      log?.('チェストが完全に満杯です');
      break;
    }

    const excludedSlots = getExcludedSlots(bot);

    // 可能なインデックス表現を包括的に収集（0-8 or 36-44 がホットバーの場合がある）
    const slots = bot.inventory?.slots || [];
    const bySlot = new Map();
    const pushIf = (slot, itm) => { if (itm) bySlot.set(slot, { ...itm, slot }); };

    // 1) items() が返す要素を優先採用（slotが 0-35 の環境想定）
    try {
      const list = typeof bot.inventory.items === 'function' ? bot.inventory.items() : [];
      for (const it of list) { if (it && typeof it.slot === 'number') pushIf(it.slot, it); }
    } catch (_) {}

    // 2) スロット配列からの補完（0-8, 9-35, 36-44）
    const ranges = [ [0, 8], [9, 35], [36, 44] ];
    for (const [a, b] of ranges) {
      for (let i = a; i <= b; i++) {
        if (!bySlot.has(i) && slots[i]) pushIf(i, slots[i]);
      }
    }

    const gathered = Array.from(bySlot.values());
    const items = gathered.filter(item => !excludedSlots.has(item.slot));

    console.error(`[DEBUG] Round ${round}:`);
    console.error(`[DEBUG]   Gathered items (union 0-8,9-35,36-44): ${gathered.length}`);
    gathered.forEach(item => { console.error(`[DEBUG]     Slot ${item.slot}: ${item.name} x${item.count}`); });
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
      } else {
        log?.(`  - ${getJaItemName(item.name)} は格納できませんでした`);
        if (result.error) console.error(`[DEPOSIT][${item.name}] error: ${result.error}`);
        roundSkipped++;
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

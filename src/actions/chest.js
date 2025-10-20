import { acquireLock, sleep } from '../lib/utils.js';
import { openNearestChest } from '../lib/containers.js';

export function register(bot, commandHandlers, ctx) {
  commandHandlers.set('chest', ({ args, sender }) => {
    const say = (m) => { if (sender) bot.chat(`@${sender} ${m}`); else bot.chat(m); };
    const sub = (args?.[0] || '').toLowerCase();
    const rest = (args || []).slice(1);

    const normalizeTok = (s) => String(s || '').toLowerCase().replace(/[,:;。．、！!？?]+$/g, '').trim();
    const parseNameCount = (arr) => {
      const a0 = arr[0]; const a1 = arr[1];
      const isNum0 = a0 !== undefined && !isNaN(Number(a0));
      const isNum1 = a1 !== undefined && !isNaN(Number(a1));
      const name = (isNum0 ? a1 : a0) || '';
      const count = Math.max(1, Math.min(64, Number(isNum0 ? a0 : (isNum1 ? a1 : 1))));
      return { name, count };
    };

    (async () => {
      try {
        if (!sub) { say('使用: chest <all|take> ...'); return; }

        if (sub === 'all' || sub === 'dump') {
          const release = await acquireLock('chest');
          try {
            const chest = await openNearestChest(bot, ctx.mcData(), ctx.gotoBlock);
            await sleep(300); // チェストが完全に開くのを待つ
            ctx.log?.('チェストを開きました');

            // チェストの状態を分析
            const analyzeChest = () => {
              const chestSlots = [];
              try {
                // チェスト内のアイテムを取得
                if (typeof chest.containerItems === 'function') {
                  chestSlots.push(...chest.containerItems());
                } else if (typeof chest.items === 'function') {
                  chestSlots.push(...chest.items());
                } else if (chest.window?.slots) {
                  // windowからスロットを取得（チェスト部分のみ）
                  const containerStart = chest.window.inventoryStart || 0;
                  const containerEnd = chest.window.inventoryEnd || chest.window.slots.length;
                  for (let i = containerStart; i < containerEnd; i++) {
                    const slot = chest.window.slots[i];
                    if (slot) chestSlots.push(slot);
                  }
                }
              } catch (err) {
                ctx.log?.(`チェスト分析エラー: ${err.message}`);
              }

              // チェストの総スロット数（通常チェスト=27, ラージチェスト=54）
              const totalSlots = chest.window?.slots ?
                (chest.window.inventoryEnd - chest.window.inventoryStart) : 27;

              const emptySlots = totalSlots - chestSlots.length;

              // アイテムタイプごとの最大スタック可能数を集計
              const stackableSpace = new Map(); // type -> 追加可能数
              for (const slot of chestSlots) {
                const maxStack = slot.stackSize || 64;
                const remaining = maxStack - slot.count;
                if (remaining > 0) {
                  const current = stackableSpace.get(slot.type) || 0;
                  stackableSpace.set(slot.type, current + remaining);
                }
              }

              return { totalSlots, emptySlots, chestSlots, stackableSpace };
            };

            // 装備・手持ちを除外するスロット
            const getExcludedSlots = () => {
              const excluded = new Set();
              if (bot.heldItem?.slot != null) excluded.add(bot.heldItem.slot);
              const equipSlots = ['head', 'torso', 'legs', 'feet'];
              for (const slot of equipSlots) {
                try {
                  const slotNum = bot.getEquipmentDestSlot?.(slot);
                  if (slotNum != null) excluded.add(slotNum);
                } catch (_) {}
              }
              if (bot.inventory?.slots?.[45]) excluded.add(45);
              return excluded;
            };

            let totalMoved = 0;
            let totalSkipped = 0;

            // 最大5回ループ
            for (let round = 1; round <= 5; round++) {
              // チェストの状態を分析
              const chestInfo = analyzeChest();
              ctx.log?.(`ラウンド${round}: チェスト状態 - 空き${chestInfo.emptySlots}/${chestInfo.totalSlots}スロット`);

              // 空きスロットが0なら終了
              if (chestInfo.emptySlots === 0 && chestInfo.stackableSpace.size === 0) {
                ctx.log?.('チェストが完全に満杯です');
                say('チェストが満杯のため、これ以上格納できません');
                break;
              }

              const excludedSlots = getExcludedSlots();
              const items = bot.inventory.items().filter(item => !excludedSlots.has(item.slot));

              if (items.length === 0) {
                ctx.log?.(`インベントリが空です`);
                break;
              }

              ctx.log?.(`${items.length}種類のアイテムを処理`);
              let roundMoved = 0;
              let roundSkipped = 0;

              // アイテムを優先度順にソート
              // 1. 既にチェストにあるアイテム（スタック可能）
              // 2. 新しいアイテム
              const sortedItems = items.sort((a, b) => {
                const aStackable = chestInfo.stackableSpace.get(a.type) || 0;
                const bStackable = chestInfo.stackableSpace.get(b.type) || 0;
                return bStackable - aStackable;
              });

              for (const item of sortedItems) {
                // スタック可能スペースまたは空きスロットがあるかチェック
                const stackableSpace = chestInfo.stackableSpace.get(item.type) || 0;
                const canDeposit = stackableSpace > 0 || chestInfo.emptySlots > 0;

                if (!canDeposit) {
                  ctx.log?.(`  ⊗ ${ctx.getJaItemName(item.name)} x${item.count} - チェストに空きなし（スキップ）`);
                  roundSkipped++;
                  continue;
                }

                try {
                  const countBefore = item.count;

                  // 格納可能数を計算
                  const maxCanDeposit = Math.max(stackableSpace, item.count);
                  const depositAmount = Math.min(item.count, maxCanDeposit);

                  await chest.deposit(item.type, null, depositAmount);
                  await sleep(250);

                  const updatedItems = bot.inventory.items();
                  const updatedItem = updatedItems.find(i => i.slot === item.slot);
                  const countAfter = updatedItem ? updatedItem.count : 0;
                  const actualMoved = countBefore - countAfter;

                  if (actualMoved > 0) {
                    ctx.log?.(`  ✓ ${ctx.getJaItemName(item.name)} x${actualMoved} を格納`);
                    roundMoved += actualMoved;

                    // チェスト情報を更新
                    if (stackableSpace > 0) {
                      const newStackable = Math.max(0, stackableSpace - actualMoved);
                      chestInfo.stackableSpace.set(item.type, newStackable);
                    } else {
                      chestInfo.emptySlots = Math.max(0, chestInfo.emptySlots - 1);
                    }
                  } else {
                    ctx.log?.(`  - ${ctx.getJaItemName(item.name)} は格納できませんでした`);
                    roundSkipped++;
                  }
                } catch (err) {
                  ctx.log?.(`  ✗ ${ctx.getJaItemName(item.name)} の格納に失敗: ${err.message}`);
                  roundSkipped++;
                }
              }

              totalMoved += roundMoved;
              totalSkipped += roundSkipped;

              ctx.log?.(`ラウンド${round}完了: 格納${roundMoved}個, スキップ${roundSkipped}個`);

              // このラウンドで何も格納できなければ終了
              if (roundMoved === 0) {
                ctx.log?.('これ以上格納できません');
                break;
              }

              await sleep(300);
            }

            chest.close();
            ctx.log?.('チェストを閉じました');

            if (totalSkipped > 0) {
              say(`一括格納完了: ${totalMoved}個を格納（${totalSkipped}個は格納できませんでした）`);
            } else {
              say(`一括格納完了: ${totalMoved}個を格納`);
            }
          } catch (err) {
            ctx.log?.(`エラー: ${err.message}`);
            say(`失敗: ${err.message}`);
          } finally {
            release();
          }
          return;
        }

        // take / withdraw
        if (sub === 'take' || sub === 'withdraw') {
          const chest = await openNearestChest(bot, ctx.mcData(), ctx.gotoBlock);
          const token = normalizeTok(rest[0]);
          if (token === 'all' || token === '*' || token === '＊' || token === '全部' || token === 'すべて' || token === '全て') {
            let took = 0;
            const listItems = () => {
              try {
                if (typeof chest.containerItems === 'function') return chest.containerItems();
                if (typeof chest.items === 'function') return chest.items();
                if (chest.window?.items) return chest.window.items();
                const slots = chest.window?.slots || [];
                return slots.filter(Boolean);
              } catch (_) { return []; }
            };
            for (let loop = 0; loop < 10; loop++) {
              const items = listItems();
              if (!items || items.length === 0) break;
              let progressed = false;
              for (const it of items) {
                try {
                  if (!it || typeof it.type !== 'number') continue;
                  const n = Math.max(1, it.count || 1);
                  await chest.withdraw(it.type, it.metadata ?? null, n);
                  took += n;
                  progressed = true;
                } catch (_) {}
              }
              if (!progressed) break;
              await sleep(80);
            }
            say(`チェストから全取得: ${took} 個`);
            try { chest.close(); } catch (_) {}
            return;
          }

          const { name, count } = parseNameCount(rest);
          if (!name) { say('使用: chest take <itemName> [count]'); try { chest.close(); } catch(_){} return; }
          const def = ctx.mcData().itemsByName[String(name).replace(/^minecraft:/, '').toLowerCase()];
          if (!def) { say(`不明なアイテム: ${name}`); try { chest.close(); } catch(_){} return; }
          const isAllCount = (() => { const t = normalizeTok(rest[1]); return (t === 'all'||t==='*'||t==='＊'||t==='全部'||t==='すべて'||t==='全て'); })();
          let remaining = isAllCount ? Infinity : Math.max(1, Math.min(64, Number(count || 1)));
          let took = 0;
          const listItems = () => {
            try {
              if (typeof chest.containerItems === 'function') return chest.containerItems();
              if (typeof chest.items === 'function') return chest.items();
              if (chest.window?.items) return chest.window.items();
              const slots = chest.window?.slots || [];
              return slots.filter(Boolean);
            } catch (_) { return []; }
          };
          for (let loop = 0; loop < 10 && remaining > 0; loop++) {
            const items = listItems();
            const candidates = items.filter((it) => it && it.type === def.id);
            if (candidates.length === 0) break;
            let progressed = false;
            for (const it of candidates) {
              const n = Math.min(remaining, it.count || remaining);
              try { await chest.withdraw(it.type, it.metadata ?? null, n); took += n; remaining -= n; progressed = true; if (remaining <= 0) break; }
              catch (_) {}
            }
            if (!progressed) break;
            await sleep(80);
          }
          say(took > 0 ? `チェストから取得${isAllCount ? '（全て）' : ''}: ${ctx.getJaItemName(def.name)} x${took}` : `チェストに ${ctx.getJaItemName(def.name)} はありません`);
          try { chest.close(); } catch (_) {}
          return;
        }

        say('使用: chest <all|take> ...');
      } catch (e) {
        say(`失敗: ${e?.message || e}`);
      }
    })();
  });
}


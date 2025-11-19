import { acquireLock, sleep } from '../lib/utils.js';
import { openNearestChest } from '../lib/containers.js';
import { depositAllItems } from '../lib/chest-operations.js';

export function register(bot, commandHandlers, ctx) {
  commandHandlers.set('chest', ({ args, sender }) => {
    const say = (m) => { bot.chat(m); };
    let sub = (args?.[0] || '').toLowerCase();
    let rest = (args || []).slice(1);
    const hasHelpFlag = (arr) => (arr || []).some(a => ['-h','--help','help','ヘルプ','/?','?'].includes(String(a||'').toLowerCase()));

    const helpGeneral = () => {
      say('使用: chest <list|find|store|take> ...');
      say('  chest list                       チェストの中身を一覧表示');
      say('  chest find <キーワード>          チェスト内のアイテムを検索');
      say('  chest store <アイテム>           指定アイテムをチェストに格納');
      say('  chest store -a                   全アイテムをチェストに格納');
      say('  chest store -kh                  ホットバー以外を格納');
      say('  chest store -ka                  防具・装備以外を格納');
      say('  chest store -ko                  オフハンド以外を格納');
      say('  chest take <アイテム> [個数]     チェストからアイテムを取得');
      say('  chest take -a                    チェストから全取得');
      say('  chest take -f <検索クエリ>       検索してアイテムを取得');
    };

    const normalizeTok = (s) => String(s || '').toLowerCase().replace(/[,:;。．、！!？?]+$/g, '').trim();
    
    const parseItemName = (name) => {
      if (!name) return null;
      const cleanName = String(name).replace(/^minecraft:/, '').toLowerCase();
      return ctx.mcData().itemsByName[cleanName] || null;
    };

    const getInventoryItems = () => {
      return bot.inventory.items();
    };

    const getChestItems = (chest) => {
      try {
        if (typeof chest.containerItems === 'function') return chest.containerItems();
        if (typeof chest.items === 'function') return chest.items();
        if (chest.window?.items) return chest.window.items();
        const slots = chest.window?.slots || [];
        return slots.filter(Boolean);
      } catch (_) { return []; }
    };

    const matchesSearch = (itemName, query) => {
      const lowerName = itemName.toLowerCase();
      const lowerQuery = query.toLowerCase();
      return lowerName.includes(lowerQuery);
    };

    (async () => {
      try {
        // chest -h / chest --help
        if (!sub && hasHelpFlag(args)) { helpGeneral(); return; }
        if (!sub) { helpGeneral(); return; }

        // サブ名前空間互換: `chest stochest <...>` をサポート（古い呼び方の互換）
        if (sub === 'stochest') {
          sub = (rest[0] || '').toLowerCase();
          rest = rest.slice(1);
        }

        // ===== chest list =====
        if (sub === 'list' || sub === 'ls') {
          const chest = await openNearestChest(bot, ctx.mcData(), ctx.gotoBlock);
          await sleep(300);
          
          const items = getChestItems(chest);
          if (items.length === 0) {
            say('チェストは空です');
          } else {
            say(`チェストの中身 (${items.length}種類):`);
            const itemCounts = {};
            for (const item of items) {
              if (!item || typeof item.type !== 'number') continue;
              const def = ctx.mcData().items[item.type];
              if (!def) continue;
              const key = def.name;
              itemCounts[key] = (itemCounts[key] || 0) + (item.count || 1);
            }
            for (const [itemName, count] of Object.entries(itemCounts)) {
              say(`  ${ctx.getJaItemName(itemName)} x${count}`);
            }
          }
          
          try { chest.close(); } catch (_) {}
          return;
        }

        // ===== chest find =====
        if (sub === 'find' || sub === 'search') {
          if (!rest.length) {
            say('使用: chest find <キーワード>');
            return;
          }
          
          const query = rest.join(' ');
          const chest = await openNearestChest(bot, ctx.mcData(), ctx.gotoBlock);
          await sleep(300);
          
          const items = getChestItems(chest);
          const matches = [];
          const itemCounts = {};
          
          for (const item of items) {
            if (!item || typeof item.type !== 'number') continue;
            const def = ctx.mcData().items[item.type];
            if (!def) continue;
            
            const jaName = ctx.getJaItemName(def.name);
            if (matchesSearch(def.name, query) || matchesSearch(jaName, query)) {
              const key = def.name;
              itemCounts[key] = (itemCounts[key] || 0) + (item.count || 1);
            }
          }
          
          if (Object.keys(itemCounts).length === 0) {
            say(`"${query}" に該当するアイテムは見つかりませんでした`);
          } else {
            say(`"${query}" の検索結果:`);
            for (const [itemName, count] of Object.entries(itemCounts)) {
              say(`  ${ctx.getJaItemName(itemName)} x${count}`);
            }
          }
          
          try { chest.close(); } catch (_) {}
          return;
        }

        // ===== chest store =====
        if (sub === 'store' || sub === 'deposit' || sub === 'put') {
          const flag = rest[0] || '';
          
          // chest store -a: 全アイテムを格納
          // chest store -a: 全アイテムを格納
          if (flag === '-a') {
            const release = await acquireLock('chest');
            try {
              const chest = await openNearestChest(bot, ctx.mcData(), ctx.gotoBlock);
              await sleep(300);
              
              const items = bot.inventory.items();
              const itemIds = [...new Set(items.map(i => i.type))];
              let totalMoved = 0;

              for (const id of itemIds) {
                const itemsOfType = items.filter(i => i.type === id);
                for (const item of itemsOfType) {
                  try {
                    await chest.deposit(item.type, item.metadata, item.count);
                    totalMoved += item.count;
                    await sleep(50);
                  } catch (e) {
                    // ignore
                  }
                }
              }
              
              chest.close();
              say(`全アイテム格納完了 (${totalMoved}個)`);
            } finally {
              release();
            }
            return;
          }
          
          // chest store -kh: ホットバー以外を格納
          if (flag === '-kh') {
            const release = await acquireLock('chest');
            try {
              const chest = await openNearestChest(bot, ctx.mcData(), ctx.gotoBlock);
              await sleep(300);
              
              let moved = 0;
              const items = getInventoryItems();
              
              for (const item of items) {
                // ホットバー (スロット0-8) をスキップ
                if (item.slot >= 36 && item.slot <= 44) continue;
                
                try {
                  await chest.deposit(item.type, item.metadata ?? null, item.count);
                  moved += item.count;
                  await sleep(50);
                } catch (_) {}
              }
              
              chest.close();
              say(`ホットバー以外を格納完了 (${moved}個)`);
            } finally {
              release();
            }
            return;
          }
          
          // chest store -ka: 防具・装備以外を格納
          if (flag === '-ka') {
            const release = await acquireLock('chest');
            try {
              const chest = await openNearestChest(bot, ctx.mcData(), ctx.gotoBlock);
              await sleep(300);
              
              let moved = 0;
              const items = getInventoryItems();
              
              for (const item of items) {
                // 防具スロット (5-8) をスキップ
                if (item.slot >= 5 && item.slot <= 8) continue;
                
                try {
                  await chest.deposit(item.type, item.metadata ?? null, item.count);
                  moved += item.count;
                  await sleep(50);
                } catch (_) {}
              }
              
              chest.close();
              say(`防具・装備以外を格納完了 (${moved}個)`);
            } finally {
              release();
            }
            return;
          }
          
          // chest store -ko: オフハンド以外を格納
          if (flag === '-ko') {
            const release = await acquireLock('chest');
            try {
              const chest = await openNearestChest(bot, ctx.mcData(), ctx.gotoBlock);
              await sleep(300);
              
              let moved = 0;
              const items = getInventoryItems();
              
              for (const item of items) {
                // オフハンドスロット (45) をスキップ
                if (item.slot === 45) continue;
                
                try {
                  await chest.deposit(item.type, item.metadata ?? null, item.count);
                  moved += item.count;
                  await sleep(50);
                } catch (_) {}
              }
              
              chest.close();
              say(`オフハンド以外を格納完了 (${moved}個)`);
            } finally {
              release();
            }
            return;
          }
          
          // chest store <アイテム>: 特定アイテムを格納
          if (!rest.length) {
            say('使用: chest store <アイテム> または chest store -a/-kh/-ka/-ko');
            return;
          }
          
          const itemName = rest.join(' ');
          const def = parseItemName(itemName);
          if (!def) {
            say(`不明なアイテム: ${itemName}`);
            return;
          }
          
          const release = await acquireLock('chest');
          try {
            const chest = await openNearestChest(bot, ctx.mcData(), ctx.gotoBlock);
            await sleep(300);
            
            const items = getInventoryItems().filter(item => item.type === def.id);
            let moved = 0;
            
            for (const item of items) {
              try {
                await chest.deposit(item.type, item.metadata ?? null, item.count);
                moved += item.count;
                await sleep(50);
              } catch (_) {}
            }
            
            chest.close();
            
            if (moved > 0) {
              say(`${ctx.getJaItemName(def.name)} を格納完了 (${moved}個)`);
            } else {
              say(`${ctx.getJaItemName(def.name)} を持っていません`);
            }
          } finally {
            release();
          }
          return;
        }

        // ===== chest take =====
        if (sub === 'take' || sub === 'withdraw' || sub === 'get') {
          const flag = rest[0] || '';
          
          // chest take -a: 全アイテムを取得
          if (flag === '-a') {
            const chest = await openNearestChest(bot, ctx.mcData(), ctx.gotoBlock);
            await sleep(300);
            
            let took = 0;
            for (let loop = 0; loop < 10; loop++) {
              const items = getChestItems(chest);
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
            
            say(`チェストから全取得: ${took}個`);
            try { chest.close(); } catch (_) {}
            return;
          }
          
          // chest take -f <検索クエリ>: 検索して取得
          if (flag === '-f') {
            if (rest.length < 2) {
              say('使用: chest take -f <検索クエリ>');
              return;
            }
            
            const query = rest.slice(1).join(' ');
            const chest = await openNearestChest(bot, ctx.mcData(), ctx.gotoBlock);
            await sleep(300);
            
            let took = 0;
            const tookItems = {};
            
            for (let loop = 0; loop < 10; loop++) {
              const items = getChestItems(chest);
              let progressed = false;
              
              for (const it of items) {
                if (!it || typeof it.type !== 'number') continue;
                const def = ctx.mcData().items[it.type];
                if (!def) continue;
                
                const jaName = ctx.getJaItemName(def.name);
                if (matchesSearch(def.name, query) || matchesSearch(jaName, query)) {
                  try {
                    const n = it.count || 1;
                    await chest.withdraw(it.type, it.metadata ?? null, n);
                    tookItems[def.name] = (tookItems[def.name] || 0) + n;
                    took += n;
                    progressed = true;
                  } catch (_) {}
                }
              }
              
              if (!progressed) break;
              await sleep(80);
            }
            
            if (took > 0) {
              say(`"${query}" で検索して取得: ${took}個`);
              for (const [itemName, count] of Object.entries(tookItems)) {
                say(`  ${ctx.getJaItemName(itemName)} x${count}`);
              }
            } else {
              say(`"${query}" に該当するアイテムは見つかりませんでした`);
            }
            
            try { chest.close(); } catch (_) {}
            return;
          }
          
          // chest take <アイテム> [個数]: 既存機能
          if (!rest.length) {
            say('使用: chest take <アイテム> [個数] または chest take -a/-f');
            return;
          }
          
          const chest = await openNearestChest(bot, ctx.mcData(), ctx.gotoBlock);
          await sleep(300);
          
          // 個数指定の解析
          const lastArg = rest[rest.length - 1];
          const isCountArg = !isNaN(Number(lastArg)) || ['all', '*', '＊', '全部', 'すべて', '全て'].includes(normalizeTok(lastArg));
          
          const itemName = isCountArg ? rest.slice(0, -1).join(' ') : rest.join(' ');
          const countArg = isCountArg ? lastArg : '1';
          
          const def = parseItemName(itemName);
          if (!def) {
            say(`不明なアイテム: ${itemName}`);
            try { chest.close(); } catch (_) {}
            return;
          }
          
          const isAllCount = ['all', '*', '＊', '全部', 'すべて', '全て'].includes(normalizeTok(countArg));
          let remaining = isAllCount ? Infinity : Math.max(1, Math.min(6400, Number(countArg)));
          let took = 0;
          
          for (let loop = 0; loop < 10 && remaining > 0; loop++) {
            const items = getChestItems(chest);
            const candidates = items.filter((it) => it && it.type === def.id);
            if (candidates.length === 0) break;
            
            let progressed = false;
            for (const it of candidates) {
              const n = Math.min(remaining, it.count || remaining);
              try {
                await chest.withdraw(it.type, it.metadata ?? null, n);
                took += n;
                remaining -= n;
                progressed = true;
                if (remaining <= 0) break;
              } catch (_) {}
            }
            if (!progressed) break;
            await sleep(80);
          }
          
          if (took > 0) {
            say(`${ctx.getJaItemName(def.name)} を取得${isAllCount ? '（全て）' : ''}: ${took}個`);
          } else {
            say(`チェストに ${ctx.getJaItemName(def.name)} はありません`);
          }
          
          try { chest.close(); } catch (_) {}
          return;
        }

        // ===== 後方互換性: chest all / chest dump =====
        if (sub === 'all' || sub === 'dump') {
          const release = await acquireLock('chest');
          try {
            const chest = await openNearestChest(bot, ctx.mcData(), ctx.gotoBlock);
            await sleep(300);
            
            const { totalMoved, totalSkipped } = await depositAllItems({
              bot,
              chest,
              getJaItemName: ctx.getJaItemName,
              log: ctx.log
            });
            
            chest.close();
            
            if (totalSkipped > 0) {
              say(`一括格納完了（一部格納できませんでした）`);
            } else {
              say(`一括格納完了 (${totalMoved}個)`);
            }
          } finally {
            release();
          }
          return;
        }

        helpGeneral();
      } catch (e) {
        say(`失敗: ${e?.message || e}`);
      }
    })();
  });
}

import { acquireLock, sleep } from '../lib/utils.js';
import { openNearestChest } from '../lib/containers.js';
import { depositAllItems } from '../lib/chest-operations.js';

export function register(bot, commandHandlers, ctx) {
  commandHandlers.set('chest', ({ args, sender }) => {
    const say = (m) => { if (sender) bot.chat(`@${sender} ${m}`); else bot.chat(m); };
    const sub = (args?.[0] || '').toLowerCase();
    const rest = (args || []).slice(1);
    const hasHelpFlag = (arr) => (arr || []).some(a => ['-h','--help','help','ヘルプ','/?','?'].includes(String(a||'').toLowerCase()));

    const helpGeneral = () => {
      say('使用: chest <all|take> ...');
      say('  chest all            近くのチェストに所持品を一括格納（入らない物はスキップ）');
      say('  chest take <item> [count|all]   近くのチェストから指定アイテムを取得');
      say('例: chest all / chest take cobblestone 32 / chest take iron_ingot all');
    };
    const helpAll = () => {
      say('使用: chest all');
      say('説明: 近くのチェストを開き、所持品を可能な限りすべて格納します。');
      say('別名: chest dump');
    };
    const helpTake = () => {
      say('使用: chest take <itemName> [count|all]');
      say('説明: 近くのチェストから指定アイテムを指定数だけ取得します。');
      say('例: chest take cobblestone 16 / chest take iron_ingot all');
      say('別名: chest withdraw');
    };

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
        // chest -h / chest --help
        if (!sub && hasHelpFlag(args)) { helpGeneral(); return; }
        if (!sub) { helpGeneral(); return; }

        // chest all -h
        if ((sub === 'all' || sub === 'dump') && hasHelpFlag(rest)) { helpAll(); return; }

        if (sub === 'all' || sub === 'dump') {
          const release = await acquireLock('chest');
          try {
            const chest = await openNearestChest(bot, ctx.mcData(), ctx.gotoBlock);
            await sleep(300);
            ctx.log?.('チェストを開きました');

            // ビジネスロジックを呼び出し
            const { totalMoved, totalSkipped } = await depositAllItems({
              bot,
              chest,
              getJaItemName: ctx.getJaItemName,
              log: ctx.log
            });

            chest.close();
            ctx.log?.('チェストを閉じました');

            // 結果を報告
            if (totalSkipped > 0) {
              say(`一括格納完了（一部格納できませんでした）`);
            } else {
              say(`一括格納完了`);
            }
          } catch (err) {
            ctx.log?.(`エラー: ${err.message}`);
            say(`失敗: ${err.message}`);
          } finally {
            release();
          }
          return;
        }
        if (sub === 'take' || sub === 'withdraw') {
          if (hasHelpFlag(rest) || !rest.length) {
            if (hasHelpFlag(rest)) { helpTake(); return; }
            // 引数なしは使い方表示
            helpTake();
            return;
          }
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

        helpGeneral();
      } catch (e) {
        say(`失敗: ${e?.message || e}`);
      }
    })();
  });
}

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
            // 除外スロット（装備 / 手 / オフハンド）
            const exclude = new Set();
            try {
              if (bot.heldItem?.slot != null) exclude.add(bot.heldItem.slot);
              const eq = ['head', 'torso', 'legs', 'feet'];
              for (const k of eq) {
                const s = bot.getEquipmentDestSlot ? bot.getEquipmentDestSlot(k) : null;
                if (s != null) exclude.add(s);
              }
              if (bot.inventory?.slots?.[45]) exclude.add(45);
            } catch (_) {}
            const stacks = bot.inventory.items().filter((it) => it && !exclude.has(it.slot));
            let moved = 0;
            for (const it of stacks) {
              let ok = false;
              for (let retry = 0; retry < 2 && !ok; retry++) {
                try { await chest.deposit(it.type, it.metadata ?? null, it.count); ok = true; }
                catch (_) { await sleep(200); }
              }
              if (ok) { moved += it.count; await sleep(250); }
            }
            await sleep(200);
            say(`一括格納: ${moved} 個をチェストへ`);
            try { chest.close(); } catch (_) {}
          } finally { release(); }
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


// チェスト格納は行わないため、関連インポートは不要

export function register(bot, commandHandlers, ctx) {
  let running = false;
  let runner = null;
  let casting = false; // 二重cast防止

  const say = (msg, sender) => { try { if (sender) bot.chat(`@${sender} ${msg}`); } catch (_) {} };
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));

  const ensureRodEquipped = async () => {
    const rod = bot.inventory.items().find((it) => it?.name === 'fishing_rod');
    if (!rod) throw new Error('釣り竿がありません');
    try { await bot.equip(rod, 'hand'); } catch (e) { throw new Error('釣り竿の装備に失敗'); }
  };

  const findShoreNearWater = () => {
    try {
      const waters = ctx.findNearestBlockByName?.('water', { count: 64, maxDistance: 32 }) || [];
      const { Vec3 } = ctx;
      const isSolid = ctx.isSolid || (() => false);
      const isAirLike = ctx.isAirLike || (() => true);
      for (const wp of waters) {
        const candidates = [
          new Vec3(1, 0, 0), new Vec3(-1, 0, 0),
          new Vec3(0, 0, 1), new Vec3(0, 0, -1)
        ];
        for (const d of candidates) {
          const shore = wp.minus(d);
          const ground = bot.blockAt(shore);
          const head = bot.blockAt(shore.offset(0, 1, 0));
          if (ground && ground.name !== 'water' && isSolid(ground) && isAirLike(head)) {
            return { shorePos: shore, waterPos: wp };
          }
        }
        // 見つからない場合でも水面を向くだけでOKにする
        return { shorePos: bot.entity.position.floored(), waterPos: wp };
      }
    } catch (_) {}
    return null;
  };

  const faceWaterOrMove = async () => {
    const found = findShoreNearWater();
    if (!found) return false;
    const { shorePos, waterPos } = found;
    try { if (ctx.gotoBlock) await ctx.gotoBlock(shorePos); } catch (_) {}
    try {
      const lp = { x: waterPos.x + 0.5, y: waterPos.y + 0.2, z: waterPos.z + 0.5 };
      await bot.lookAt(lp, true);
    } catch (_) {}
    return true;
  };

  const fishOnce = async () => {
    await ensureRodEquipped();
    // 事前にできる限り水面へ向く／移動
    try { await faceWaterOrMove(); } catch (_) {}
    if (typeof bot.fish !== 'function') {
      // Fallback: activateItem で擬似的に
      bot.activateItem?.();
      await pause(4000);
      bot.deactivateItem?.();
      return;
    }
    if (casting) { await pause(300); return; }
    casting = true;
    try {
      // 安全タイムアウトを設けてハングを防止（無反応サーバー向け）
      const TIMEOUT_MS = 20000;
      await Promise.race([
        bot.fish(),
        (async () => { await pause(TIMEOUT_MS); throw new Error('fish-timeout'); })()
      ]);
    } catch (e) {
      const msg = String(e?.message || '');
      // 二重呼び出しエラーは握りつぶして軽く待って次へ
      if (/cancelled/i.test(msg) && /fish\(\) again/i.test(msg)) {
        await pause(300);
        return;
      }
      // 水に関するエラーは体勢調整して次ループに任せる
      if (/water|no water|bobber|fish-timeout/i.test(msg)) {
        try { await faceWaterOrMove(); } catch (_) {}
        return;
      }
      throw e;
    } finally {
      casting = false;
    }
  };

  // 自動格納は無効（ユーザー要望）

  const startLoop = async (sender) => {
    if (running) { say('すでに釣り中です', sender); return; }
    running = true;
    say('釣りを開始します', sender);
    runner = (async () => {
      while (running) {
        try {
          await faceWaterOrMove();
          await fishOnce();
          // 結果を軽く通知
          const cnt = bot.inventory.items().filter((i) => /cod|salmon|tropical_fish|pufferfish|raw_fish/.test(i.name)).reduce((a, b) => a + (b?.count || 0), 0);
          ctx.log?.(`釣り成功。魚の所持数: ${cnt}`);
          // 自動格納は行わない
        } catch (e) {
          ctx.log?.(`釣りエラー: ${e?.message || e}`);
          await pause(800);
        }
        await pause(500);
      }
    })();
  };

  const stopLoop = (sender) => {
    if (!running) { say('釣りは動作していません', sender); return; }
    running = false;
    runner = null;
    say('釣りを停止しました', sender);
  };

  const fishHandler = async ({ args, sender }) => {
    const sub = (args[0] || 'start').toLowerCase();
    if (sub === 'start' || sub === 'on') return startLoop(sender);
    if (sub === 'once') {
      try {
        await faceWaterOrMove();
        await fishOnce();
        say('1回釣りました', sender);
        // 自動格納は行わない
      } catch (e) {
        say(`釣り失敗: ${e?.message || e}`, sender);
      }
      return;
    }
    if (sub === 'stop' || sub === 'off') return stopLoop(sender);
    say('使用: fish [start|once|stop]', sender);
  };
  commandHandlers.set('fish', fishHandler);

  // 日本語エイリアス
  commandHandlers.set('釣り', (ctx2) => fishHandler(ctx2));
  commandHandlers.set('つり', (ctx2) => fishHandler(ctx2));
  commandHandlers.set('釣り開始', ({ sender }) => fishHandler({ args: ['start'], sender }));
  commandHandlers.set('釣りスタート', ({ sender }) => fishHandler({ args: ['start'], sender }));
  commandHandlers.set('釣りを開始', ({ sender }) => fishHandler({ args: ['start'], sender }));
  commandHandlers.set('釣りを開始する', ({ sender }) => fishHandler({ args: ['start'], sender }));
  commandHandlers.set('釣り開始する', ({ sender }) => fishHandler({ args: ['start'], sender }));
  // stop variants (JP)
  commandHandlers.set('釣り停止', ({ sender }) => fishHandler({ args: ['stop'], sender }));
  commandHandlers.set('釣りを停止', ({ sender }) => fishHandler({ args: ['stop'], sender }));
  commandHandlers.set('釣り終了', ({ sender }) => fishHandler({ args: ['stop'], sender }));
  commandHandlers.set('釣りやめて', ({ sender }) => fishHandler({ args: ['stop'], sender }));
  // 英語系エイリアス
  commandHandlers.set('fishing', (ctx2) => fishHandler(ctx2));
  commandHandlers.set('startfishing', ({ sender }) => fishHandler({ args: ['start'], sender }));
  commandHandlers.set('fishon', ({ sender }) => fishHandler({ args: ['start'], sender }));
}

export function register(bot, commandHandlers, ctx) {
  const hasHelp = (arr) => (arr || []).some(a => ['-h','--help','help','ヘルプ','/?','?'].includes(String(a||'').toLowerCase()));
  const say = (m) => { try { bot.chat(m); } catch (_) {} };

  const bedNames = (() => {
    const colors = ['white','orange','magenta','light_blue','yellow','lime','pink','gray','light_gray','cyan','purple','blue','brown','green','red','black'];
    const arr = colors.map(c => `${c}_bed`);
    arr.push('bed');
    return arr;
  })();

  const findNearestBed = () => {
    try {
      const pos = bot.entity.position;
      let best = null;
      for (const name of bedNames) {
        const found = ctx.findNearestBlockByName?.(name, { count: 8, maxDistance: 24 }) || [];
        for (const p of found) {
          const d2 = p.distanceTo(pos);
          if (!best || d2 < best.d2) best = { p, d2 };
        }
      }
      return best?.p || null;
    } catch (_) { return null; }
  };

  const trySleep = async () => {
    if (bot.isSleeping) { say('もう寝ています'); return; }
    const bedPos = findNearestBed();
    if (!bedPos) { say('近くにベッドが見つかりません'); return; }
    try { if (ctx.gotoBlock) await ctx.gotoBlock(bedPos); } catch (_) {}
    const bed = bot.blockAt(bedPos);
    try {
      if (typeof bot.sleep === 'function') {
        await bot.sleep(bed);
      } else if (bot.activateBlock) {
        await bot.activateBlock(bed);
      } else {
        throw new Error('sleep API が利用できません');
      }
      say('おやすみなさい');
    } catch (e) {
      const msg = String(e?.message || '');
      if (/not night|can\'t sleep|you can only sleep/i.test(msg)) {
        say('今は寝られません（夜ではない／嵐ではない）');
      } else if (/occupied|someone is sleeping/i.test(msg)) {
        say('そのベッドは使用中です');
      } else if (/too far/i.test(msg)) {
        say('ベッドが遠すぎます');
      } else {
        say(`寝られませんでした: ${msg}`);
      }
    }
  };

  const tryWake = async () => {
    try {
      if (bot.isSleeping && typeof bot.wake === 'function') {
        await bot.wake();
        say('起きました');
      } else if (!bot.isSleeping) {
        say('起きています');
      } else {
        say('wake API が利用できません');
      }
    } catch (e) {
      say(`起きられませんでした: ${e?.message || e}`);
    }
  };

  const sleepHandler = async ({ args = [] }) => {
    if (hasHelp(args)) {
      say('ベッドで寝ます。');
      say('使用: sleep [start] / sleep wake');
      say('例: sleep / sleep wake');
      return;
    }
    const sub = String(args[0] || 'start').toLowerCase();
    if (sub === 'wake' || sub === 'stop' || sub === 'off') return tryWake();
    return trySleep();
  };

  commandHandlers.set('sleep', sleepHandler);
  commandHandlers.set('bed', (ctx2) => sleepHandler(ctx2));
  // 日本語エイリアス
  commandHandlers.set('寝る', (ctx2) => sleepHandler(ctx2));
  commandHandlers.set('ねる', (ctx2) => sleepHandler(ctx2));
  commandHandlers.set('ベッド', (ctx2) => sleepHandler(ctx2));
}


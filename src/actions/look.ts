import type { RegisterFn } from './index';

export const register: RegisterFn = (bot, commandHandlers, ctx) => {
  commandHandlers.set('look', ({ args, sender }: any) => {
    const say = (m: string) => { if (sender) bot.chat(`@${sender} ${m}`); else bot.chat(m); };
    const eye = bot.entity.position.offset(0, 1.6, 0);
    const lookDir = async (kind: string) => {
      const { front, back, left, right } = ctx.yawToDir();
      let dir: any = null;
      if (kind === 'front') dir = front; else if (kind === 'back') dir = back; else if (kind === 'left') dir = left; else if (kind === 'right') dir = right;
      if (dir) { const target = eye.plus({ x: dir.x * 6, y: dir.y * 6, z: dir.z * 6 }); await bot.lookAt(target, true); return true; }
      if (kind === 'up') { await bot.lookAt(eye.offset(0, 6, 0), true); return true; }
      if (kind === 'down') { await bot.lookAt(eye.offset(0, -6, 0), true); return true; }
      return false;
    };
    (async () => {
      try {
        const a0 = (args[0] || '').toLowerCase();
        if (!a0) { say('使用: look <front|back|left|right|up|down|player|x y z>'); return; }
        if (await lookDir(a0)) return;
        if (args.length >= 3 && !isNaN(Number(args[0])) && !isNaN(Number(args[1])) && !isNaN(Number(args[2]))) {
          const x = Number(args[0]); const y = Number(args[1]); const z = Number(args[2]);
          await bot.lookAt({ x: x + 0.5, y: y + 0.5, z: z + 0.5 }, true); return;
        }
        const name = args[0];
        const pl = bot.players[name];
        if (pl?.entity?.position) { const p = pl.entity.position; await bot.lookAt({ x: p.x, y: p.y + 1.6, z: p.z }, true); return; }
        say('対象が見つかりません');
      } catch (e: any) { say(`失敗: ${e.message}`); }
    })();
  });
  commandHandlers.set('face', (ctx2: any) => commandHandlers.get('look')(ctx2));
  commandHandlers.set('向く', (ctx2: any) => commandHandlers.get('look')(ctx2));
};


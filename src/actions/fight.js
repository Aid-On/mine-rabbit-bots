import { isWeapon, bestWeapon, ensureWeaponEquipped, findNearestHostile, findNearestHostileWithin, findByName, collectNearbyDrops } from './fight2.js';

export function register(bot, commandHandlers, ctx) {
  const say = (m) => { try { bot.chat(m); } catch (_) {} };
  const hasHelp = (arr=[]) => arr.some(a => ['-h','--help','help','ヘルプ','/?','?'].includes(String(a||'').toLowerCase()));

  let running = false;
  let timer = null;
  let targetEntity = null;
  let prevCanDig = null;
  const RETREAT_HP = 3; // HPが3以下で撤退（0-20スケール）
  let desiredKills = 1;
  let killsDone = 0;
  let nameFilter = null;
  let taskQueue = [];
  let currentTask = null; // { name: string|null, count: number }
  let killSpots = [];
  let lastTargetPos = null;
  let lastEncounterAt = 0;
  let lastHP = null;

  const hostileNames = new Set([
    'zombie','husk','drowned','zombie_villager','skeleton','stray','wither_skeleton','creeper','spider','cave_spider','enderman','slime','magma_cube','witch','vindicator','evoker','pillager','ravager','phantom','vex','guardian','elder_guardian','hoglin','zoglin','piglin_brute','blaze','ghast','wither','warden','shulker','silverfish','endermite','guardian','phantom'
  ]);

  // weapon helpers moved to fight2.js

  // finder helpers moved to fight2.js

  // name finder moved to fight2.js

  const isWeapon = (it) => !!it && (/(_sword$|_axe$)/.test(String(it.name||'')));
  // equip helpers moved to fight2.js

  const stopFight = () => {
    running = false;
    targetEntity = null;
    if (timer) { clearInterval(timer); timer = null; }
    try { bot.pathfinder?.setGoal?.(null); } catch (_) {}
    // 掘削設定を元に戻す
    const m = bot.pathfinder?.movements;
    if (m && prevCanDig !== null) { m.canDig = prevCanDig; prevCanDig = null; }
    desiredKills = 1;
    killsDone = 0;
    nameFilter = null;
    taskQueue = [];
    currentTask = null;
    killSpots = [];
    lastTargetPos = null;
  };

  const retreatFrom = (e) => {
    try {
      const from = e?.position || bot.entity.position;
      const me = bot.entity.position;
      const dx = me.x - from.x;
      const dz = me.z - from.z;
      const len = Math.max(0.001, Math.hypot(dx, dz));
      const nx = dx / len, nz = dz / len;
      const dist = 8;
      const tx = me.x + nx * dist;
      const tz = me.z + nz * dist;
      if (bot.pathfinder?.setGoal) bot.pathfinder.setGoal(new ctx.goals.GoalNear(tx, me.y, tz, 2));
    } catch (_) {}
  };

  let loopBusy = false;
  // drop collector moved to fight2.js

  const loop = async () => {
    if (loopBusy) return; loopBusy = true;
    if (!running) return;
    if (!targetEntity || !bot.entities[targetEntity.id]) {
      // ターゲット消滅（撃破/離脱）
      killsDone += 1;
      // 撃破地点を記録（後でまとめて回収）
      const spot = (lastTargetPos && lastTargetPos.clone) ? lastTargetPos.clone() : (targetEntity && targetEntity.position) || bot.entity.position;
      killSpots.push(spot);
      if (killsDone >= desiredKills) {
        say(`戦闘完了: ${killsDone}/${desiredKills}${nameFilter ? ` (${nameFilter})` : ''}`);
        // 次タスクへ
        if (taskQueue.length > 0) {
          currentTask = taskQueue.shift();
          desiredKills = Math.max(1, currentTask.count || 1);
          nameFilter = currentTask.name || null;
          killsDone = 0;
        } else {
          // 全タスク完了: 撃破地点すべてで回収
          try {
            for (const p of killSpots) {
              await collectNearbyDrops(p, { radius: 6, timeoutMs: 3500 });
            }
          } catch (_) {}
          stopFight();
          loopBusy = false; return;
        }
      }
      // 次ターゲットを取得（現在のタスクに基づく）
      const next = nameFilter ? findByName(bot, nameFilter) : findNearestHostile(bot, hostileNames);
      if (!next) { say('次のターゲットが見つかりません'); stopFight(); loopBusy = false; return; }
      targetEntity = next;
      say(`次のターゲット: ${next.name}（${killsDone}/${desiredKills}${nameFilter ? ` ${nameFilter}` : ''}）`);
      loopBusy = false; return;
    }
    const e = bot.entities[targetEntity.id];
    const pos = e.position;
    lastTargetPos = pos;
    // 距離
    const d2 = pos.distanceSquared(bot.entity.position);
    const close = d2 <= (3*3);

    // 低HPなら撤退
    try {
      const hp = Number(bot.health ?? 0);
      if (hp <= RETREAT_HP) {
        say('撤退: HPが低下しました');
        retreatFrom(e);
        stopFight();
        loopBusy = false; return;
      }
    } catch (_) {}

    // 追従して攻撃
    try {
      if (!close && bot.pathfinder?.setGoal) {
        bot.pathfinder.setGoal(new ctx.goals.GoalNear(pos.x, pos.y, pos.z, 1));
      }
      if (close) {
        await ensureWeaponEquipped();
        // 視線合わせ
        bot.lookAt(pos.offset(0, 1.2, 0), true).catch(()=>{});
        // 攻撃
        try { bot.attack(e); } catch (_) {}
      }
    } catch (_) {}
    loopBusy = false;
  };

  const startFight = async (entity) => {
    if (running) stopFight();
    await ensureWeaponEquipped(bot);
    // 掘削無効化
    const m = bot.pathfinder?.movements;
    if (m && prevCanDig === null && typeof m.canDig === 'boolean') prevCanDig = m.canDig;
    if (m && prevCanDig !== null) m.canDig = false;
    running = true;
    targetEntity = entity;
    say(`戦闘開始: ${entity.name}（目標 ${desiredKills} 体${nameFilter ? ` ${nameFilter}` : ''}）`);
    timer = setInterval(loop, 200);
  };

  const fightHandler = async ({ args = [] }) => {
    if (hasHelp(args)) {
      say('近くのモブと戦います。');
      say('使用: fight [mobName] [count] | fight [count] [mobName] | fight stop');
      say('複数指定: fight cow 6 & sheep 2 など（順次処理）');
      say('別名: attack/kill/戦う/攻撃');
      return;
    }
    const sub = String(args[0] || '').toLowerCase();
    if (sub === 'stop' || sub === 'off' || sub === 'やめて') { stopFight(); say('戦闘停止'); return; }

    // 引数解析: 単一 or 複数（& 区切り）
    const argStr = args.map(a => String(a)).join(' ').trim();
    const segments = /[&＆,]/.test(argStr) ? argStr.split(/[&＆,]/) : [argStr];
    const parseSeg = (seg) => {
      const toks = String(seg || '').trim().split(/\s+/).filter(Boolean);
      let cnt = null; let nm = null;
      for (const t of toks) {
        const n = Number(t);
        if (!isNaN(n)) cnt = Math.max(1, Math.min(1000, Math.floor(n)));
        else if (!nm) nm = String(t).toLowerCase();
      }
      return { name: nm || null, count: cnt || 1 };
    };
    taskQueue = segments.map(parseSeg).filter(t => t.count > 0);
    if (taskQueue.length === 0) taskQueue = [{ name: null, count: 1 }];
    currentTask = taskQueue.shift();
    desiredKills = currentTask.count || 1;
    killsDone = 0;
    nameFilter = currentTask.name || null;

    // ターゲット選定
    let e = null;
    if (nameFilter) e = findByName(bot, nameFilter) || null;
    if (!e) e = findNearestHostile(bot, hostileNames);
    if (!e) { say('ターゲットが見つかりません'); return; }
    try { await startFight(e); } catch (e2) { say(`開始失敗: ${e2?.message || e2}`); }
  };

  commandHandlers.set('fight', fightHandler);
  commandHandlers.set('attack', (ctx2) => fightHandler(ctx2));
  commandHandlers.set('kill', (ctx2) => fightHandler(ctx2));
  // 日本語
  commandHandlers.set('戦う', (ctx2) => fightHandler(ctx2));
  commandHandlers.set('攻撃', (ctx2) => fightHandler(ctx2));
  commandHandlers.set('やめて', ({ sender }) => fightHandler({ args: ['stop'], sender }));

  // 自動遭遇メッセージ・自動反撃は無効化（ユーザー指示の fight のみ実行）
}

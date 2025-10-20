export function register(bot, commandHandlers, ctx) {
  // build <blockName> [front|back|left|right|up|down|near]
  commandHandlers.set('build', ({ args, sender }) => {
    const blockName = args[0];
    const dirArg = (args[1] || 'front').toLowerCase();

    if (!blockName) {
      bot.chat(sender ? `@${sender} 使用方法: build <blockName> [front|back|left|right|up|down|near]` : 'usage: build <blockName> [dir]');
      return;
    }

    const item = bot.inventory.items().find((i) => i.name === blockName);
    if (!item) {
      bot.chat(sender ? `@${sender} インベントリに ${ctx.getJaItemName(blockName)} がありません` : `no ${blockName}`);
      return;
    }

    const { front, back, left, right } = ctx.yawToDir();
    const base = bot.entity.position.floored();
    const isAirLike = ctx.isAirLike;
    const findRef = ctx.findPlaceRefForTarget;
    const Vec3 = ctx.Vec3;

    // 近場で設置可能な場所を探す
    const pickNear = () => {
      const dirs = [
        new Vec3(1, 0, 0), new Vec3(-1, 0, 0), new Vec3(0, 0, 1), new Vec3(0, 0, -1),
        new Vec3(2, 0, 0), new Vec3(-2, 0, 0), new Vec3(0, 0, 2), new Vec3(0, 0, -2),
        new Vec3(1, 0, 1), new Vec3(1, 0, -1), new Vec3(-1, 0, 1), new Vec3(-1, 0, -1)
      ];

      for (const d of dirs) {
        const tp = base.plus(d);
        const tBlock = bot.blockAt(tp);
        if (!isAirLike(tBlock)) continue;

        const below = bot.blockAt(tp.offset(0, -1, 0));
        if (!ctx.isSolid(below)) continue;

        const r = findRef(tp);
        if (r) return { tp, r };
      }
      return null;
    };

    let targetPos = null;
    let ref = null;

    // 設置位置を決定
    if (dirArg === 'near') {
      const found = pickNear();
      if (found) {
        targetPos = found.tp;
        ref = found.r;
      }
    } else {
      let offset = front.clone();

      if (dirArg === 'back') offset = back.clone();
      else if (dirArg === 'left') offset = left.clone();
      else if (dirArg === 'right') offset = right.clone();
      else if (dirArg === 'up') offset = new Vec3(0, 1, 0);
      else if (dirArg === 'down') offset = new Vec3(0, -1, 0);

      targetPos = base.plus(offset);
    }

    if (!targetPos) {
      bot.chat(sender ? `@${sender} 近くに設置できる場所が見つかりません` : 'no place');
      return;
    }

    // 指定位置がすでにブロックで埋まっている場合は近場を探す
    const targetBlock = bot.blockAt(targetPos);
    if (!isAirLike(targetBlock)) {
      const found = pickNear();
      if (found) {
        targetPos = found.tp;
        ref = found.r;
      }
    }

    if (!ref) ref = findRef(targetPos);
    if (!ref) {
      bot.chat(sender ? `@${sender} 参照ブロックが見つからず設置できません` : 'no ref');
      return;
    }

    (async () => {
      try {
        await bot.equip(item, 'hand');
        bot.setControlState('sneak', true);
        await bot.placeBlock(ref.refBlock, ref.face);

        bot.chat(sender ? `@${sender} ${ctx.getJaItemName(blockName)} を設置しました` : 'placed');
      } catch (err) {
        ctx.log?.(`設置できませんでした: ${err.message}`);
        bot.chat(sender ? `@${sender} 設置失敗: ${err.message}` : `fail: ${err.message}`);
      } finally {
        setTimeout(() => bot.setControlState('sneak', false), 300);
      }
    })();
  });
}


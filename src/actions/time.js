export function register(bot, commandHandlers) {
  const say = (m) => { try { bot.chat(m); } catch (_) {} };
  const hasHelp = (arr) => (arr || []).some(a => ['-h','--help','help','ヘルプ','/?','?'].includes(String(a||'').toLowerCase()));

  const describeTime = () => {
    const isDay = !!(bot.time && typeof bot.time.isDay === 'boolean' ? bot.time.isDay : false);
    const tod = bot.time?.timeOfDay ?? null;
    const label = isDay ? '昼' : '夜';
    if (tod != null) {
      const mc = Math.floor(Number(tod));
      return `今は${label}です（timeOfDay=${mc}）`;
    }
    return `今は${label}です`;
  };

  const timeHandler = ({ args = [] }) => {
    if (hasHelp(args)) {
      say('日中か夜かを返します。');
      say('使用: time');
      say('別名: day / night / 昼 / 夜');
      return;
    }
    say(describeTime());
  };

  const askDay = ({ args = [] }) => { if (hasHelp(args)) { return timeHandler({ args }); } const isDay = !!(bot.time && typeof bot.time.isDay === 'boolean' ? bot.time.isDay : false); say(isDay ? 'はい、今は昼です' : 'いいえ、今は夜です'); };
  const askNight = ({ args = [] }) => { if (hasHelp(args)) { return timeHandler({ args }); } const isDay = !!(bot.time && typeof bot.time.isDay === 'boolean' ? bot.time.isDay : false); say(!isDay ? 'はい、今は夜です' : 'いいえ、今は昼です'); };

  commandHandlers.set('time', timeHandler);
  commandHandlers.set('day', askDay);
  commandHandlers.set('night', askNight);
  // 日本語エイリアス
  commandHandlers.set('昼', askDay);
  commandHandlers.set('夜', askNight);
}


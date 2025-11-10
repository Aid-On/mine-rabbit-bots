import * as look from './look.js';
import * as status from './status.js';
import * as ping from './ping.js';
import * as follow from './follow.js';
import * as jump from './jump.js';
import * as items from './items.js';
import * as help from './help.js';
import * as ja from './ja.js';
import * as build from './build.js';
import * as dig from './dig.js';
import * as chest from './chest.js';
import * as craft from './craft.js';
import * as furnace from './furnace.js';
import * as perf from './perf.js';
import * as fish from './fish.js';
import * as eat from './eat.js';
import * as skin from './skin.js';
import * as sleep from './sleep.js';
import * as light from './light.js';
import * as time from './time.js';

export function registerActions(bot, commandHandlers, ctx) {
  const modules = [
    look, status, ping, follow, jump, items, help, ja, build, dig, chest, craft, furnace, perf, fish, eat, skin, sleep, light, time
  ];
  for (const m of modules) {
    try {
      if (m && typeof m.register === 'function') m.register(bot, commandHandlers, ctx);
    } catch (e) {
      console.error('actions load error:', e?.message || e);
    }
  }
}

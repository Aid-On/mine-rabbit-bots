#!/usr/bin/env node
import { createBot } from 'mineflayer';
import pathfinderPlugin from 'mineflayer-pathfinder';
import minecraftData from 'minecraft-data';
import { Vec3 } from 'vec3';

const { pathfinder, Movements, goals } = pathfinderPlugin;

const host = process.env.MINEFLYER_HOST || 'localhost';
const port = Number(process.env.MINEFLYER_PORT || 25565);
const username = process.env.MINEFLYER_USERNAME || 'pino';
const versionEnv = process.env.MINEFLYER_VERSION;
const version = versionEnv === undefined || versionEnv === '' ? false : versionEnv;

const log = (message) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${username}] ${message}`);
};

const bot = createBot({
  host,
  port,
  username,
  version,
  auth: 'offline'
});

bot.loadPlugin(pathfinder);

bot.once('spawn', () => {
  log(`スポーンしました: ${host}:${port} / ${bot.username}`);

  bot.chat(`/say Bot ${bot.username} がオンラインになりました`);

  const mcData = minecraftData(bot.version);
  const defaultMove = new Movements(bot, mcData);
  bot.pathfinder.setMovements(defaultMove);
});

const state = {
  followTarget: null,
  followTask: null
};

const clearFollowTask = () => {
  if (state.followTask) {
    clearInterval(state.followTask);
    state.followTask = null;
  }
};

const startFollowing = (target) => {
  state.followTarget = target;
  clearFollowTask();
  state.followTask = setInterval(() => {
    const player = bot.players[state.followTarget];
    if (player?.entity) {
      const pos = player.entity.position;
      bot.pathfinder.setGoal(new goals.GoalNear(pos.x, pos.y, pos.z, 2));
      return;
    }

    log(`フォロー対象が見つかりません: ${state.followTarget}`);
    stopFollowing();
  }, 1000);
};

const stopFollowing = () => {
  state.followTarget = null;
  clearFollowTask();
  bot.pathfinder.setGoal(null);
};

const commandHandlers = new Map();

commandHandlers.set('ping', () => {
  bot.chat('pong');
});

commandHandlers.set('come', ({ sender }) => {
  const player = bot.players[sender];
  if (player?.entity) {
    const { x, y, z } = player.entity.position;
    bot.pathfinder.setGoal(new goals.GoalNear(x, y, z, 1));
  }
});

commandHandlers.set('follow', ({ sender }) => {
  log(`フォロー開始: ${sender}`);
  startFollowing(sender);
});

commandHandlers.set('stop', () => {
  log('フォローを停止します');
  stopFollowing();
});

commandHandlers.set('jump', () => {
  bot.setControlState('jump', true);
  setTimeout(() => bot.setControlState('jump', false), 500);
});

commandHandlers.set('dig', () => {
  const block = bot.blockAtCursor(5) || bot.blockAt(bot.entity.position.offset(0, -1, 0));
  if (block && block.name !== 'air') {
    bot.dig(block).catch((err) => log(`掘れませんでした: ${err.message}`));
  }
});

commandHandlers.set('build', ({ args }) => {
  const blockName = args[0];
  if (!blockName) return;
  const item = bot.inventory.items().find((i) => i.name === blockName);
  if (!item) return;

  const referenceBlock = bot.blockAt(bot.entity.position.offset(0, -1, 0));
  if (!referenceBlock || referenceBlock.name === 'air') return;

  bot.equip(item, 'hand')
    .then(() => bot.placeBlock(referenceBlock, new Vec3(0, 1, 0)))
    .catch((err) => log(`設置できませんでした: ${err.message}`));
});

const parseCommand = (sender, message) => {
  const trimmed = message.trim();
  if (!trimmed) return null;

  const parts = trimmed.split(/\s+/);
  const first = parts[0].toLowerCase();
  const explicitTarget = first.startsWith('!') ? first.substring(1) : null;

  if (explicitTarget && explicitTarget !== bot.username.toLowerCase()) {
    return null;
  }

  const commandParts = explicitTarget ? parts.slice(1) : parts;
  const command = commandParts[0]?.toLowerCase();
  const args = commandParts.slice(1);

  if (!command) return null;

  return { command, args, sender };
};

bot.on('chat', (sender, message) => {
  log(`チャット <${sender}> ${message}`);
  if (sender === bot.username) return;

  const parsed = parseCommand(sender, message);
  if (!parsed) return;

  const handler = commandHandlers.get(parsed.command);
  if (handler) {
    handler(parsed);
  } else {
    log(`未対応コマンド: ${parsed.command}`);
  }
});

bot.on('kicked', (reason) => {
  log(`サーバーからキックされました: ${reason}`);
});

bot.on('end', (reason) => {
  log(`接続が終了しました: ${reason}`);
  stopFollowing();
});

bot.on('error', (error) => {
  log(`エラー: ${error.message}`);
});

process.on('SIGINT', () => {
  log('終了処理中...');
  bot.quit('ユーザーによる停止');
  setTimeout(() => process.exit(0), 1000);
});

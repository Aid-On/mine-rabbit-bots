#!/usr/bin/env node
import { spawn } from 'child_process';

const bots = ['wim', 'pino', 'yuki'];

const host = process.env.MINEFLYER_HOST || '127.0.0.1';
const port = process.env.MINEFLYER_PORT || '25565';
const version = process.env.MINEFLYER_VERSION || '';
const serverPath = process.env.SERVER_PATH || '../craftsman';

console.log(`Starting ${bots.length} bots...`);

const startBot = (botName) => {
  const env = {
    ...process.env,
    MINEFLYER_HOST: host,
    MINEFLYER_PORT: port,
    MINEFLYER_USERNAME: botName,
    MINEFLYER_VERSION: version,
    SERVER_PATH: serverPath
  };

  const bot = spawn('node', ['src/bot.js'], {
    env,
    stdio: 'inherit'
  });

  bot.on('error', (err) => {
    console.error(`[${botName}] エラー:`, err);
  });

  bot.on('exit', (code) => {
    console.log(`[${botName}] 終了しました (code: ${code})`);

    // 正常終了（code: 0）の場合は3秒後に再起動
    if (code === 0) {
      console.log(`[${botName}] 3秒後に再起動します...`);
      setTimeout(() => {
        console.log(`[${botName}] 再起動中...`);
        startBot(botName);
      }, 3000);
    }
  });
};

// 各 bot を5秒間隔で起動
bots.forEach((botName, index) => {
  setTimeout(() => {
    console.log(`Starting bot: ${botName}...`);
    startBot(botName);
  }, index * 5000);
});

process.on('SIGINT', () => {
  console.log('\n全てのbotを終了しています...');
  process.exit(0);
});

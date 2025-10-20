#!/usr/bin/env node
// チェスト操作のテストコード

import { createBot } from 'mineflayer';
import minecraftData from 'minecraft-data';
import './src/env.js';

const rawHost = process.env.MINEFLAYER_HOST || '127.0.0.1';
let host = rawHost;
let hostPortFromHost = null;
if (rawHost.includes(':')) {
  const parts = rawHost.split(':');
  host = parts[0];
  hostPortFromHost = parts[1];
}
const port = Number(process.env.MINEFLAYER_PORT || hostPortFromHost || 25565);
const username = 'test_bot';

console.log(`テストBot起動: ${host}:${port}`);

const bot = createBot({
  host,
  port,
  username,
  auth: 'offline'
});

bot.once('spawn', async () => {
  console.log('スポーンしました');
  console.log('チャットで "test" と入力してテストを開始してください');
});

bot.on('chat', async (username, message) => {
  if (message !== 'test') return;

  console.log('\n=== チェスト格納テスト開始 ===\n');

  try {
    // 近くのチェストを探す
    const mcData = minecraftData(bot.version);
    const chestIds = [];
    const add = (n) => { const b = mcData.blocksByName[n]; if (b) chestIds.push(b.id); };
    add('chest'); add('trapped_chest');

    const chestBlock = bot.findBlock({ matching: chestIds, maxDistance: 6 });
    if (!chestBlock) {
      console.log('✗ 近くにチェストが見つかりません');
      bot.chat('近くにチェストがありません');
      return;
    }

    console.log(`✓ チェストを発見: ${chestBlock.position}`);

    // チェストを開く
    const chest = await bot.openChest(chestBlock);
    await new Promise(r => setTimeout(r, 500));
    console.log('✓ チェストを開きました');

    // チェストの情報を表示
    console.log('\n--- チェスト情報 ---');
    console.log('chest.window:', chest.window ? 'あり' : 'なし');

    if (chest.window) {
      console.log('  inventoryStart:', chest.window.inventoryStart);
      console.log('  inventoryEnd:', chest.window.inventoryEnd);
      console.log('  slots.length:', chest.window.slots.length);

      // チェストの内容を表示
      console.log('\n--- チェストの内容 ---');
      const containerStart = chest.window.inventoryStart || 0;
      const containerEnd = chest.window.inventoryEnd || chest.window.slots.length;
      let itemCount = 0;

      for (let i = containerStart; i < containerEnd; i++) {
        const slot = chest.window.slots[i];
        if (slot) {
          console.log(`  スロット${i}: ${slot.name} x${slot.count} (type:${slot.type}, stackSize:${slot.stackSize})`);
          itemCount++;
        }
      }

      const totalSlots = containerEnd - containerStart;
      const emptySlots = totalSlots - itemCount;
      console.log(`\n  総スロット数: ${totalSlots}`);
      console.log(`  使用中: ${itemCount}`);
      console.log(`  空き: ${emptySlots}`);
    }

    // Botのインベントリを表示
    console.log('\n--- Botのインベントリ ---');
    const items = bot.inventory.items();
    console.log(`アイテム数: ${items.length}`);
    for (const item of items.slice(0, 10)) {
      console.log(`  スロット${item.slot}: ${item.name} x${item.count} (type:${item.type})`);
    }

    if (items.length === 0) {
      console.log('✗ インベントリが空です');
      chest.close();
      bot.chat('インベントリが空です');
      return;
    }

    // 最初のアイテムを格納テスト
    const testItem = items[0];
    console.log(`\n--- 格納テスト: ${testItem.name} x${testItem.count} ---`);
    console.log(`格納前 - スロット${testItem.slot}: ${testItem.count}個`);

    try {
      // deposit を実行
      console.log(`chest.deposit(${testItem.type}, null, ${testItem.count}) を実行...`);
      await chest.deposit(testItem.type, null, testItem.count);
      await new Promise(r => setTimeout(r, 500));

      // 格納後の状態を確認
      const afterItems = bot.inventory.items();
      const afterItem = afterItems.find(i => i.slot === testItem.slot);

      console.log(`格納後 - スロット${testItem.slot}: ${afterItem ? afterItem.count : 0}個`);
      console.log(`実際に移動: ${testItem.count - (afterItem ? afterItem.count : 0)}個`);

      // チェストの内容を再確認
      console.log('\n--- 格納後のチェスト内容 ---');
      if (chest.window) {
        const containerStart = chest.window.inventoryStart || 0;
        const containerEnd = chest.window.inventoryEnd || chest.window.slots.length;
        let itemCount = 0;

        for (let i = containerStart; i < containerEnd; i++) {
          const slot = chest.window.slots[i];
          if (slot) {
            console.log(`  スロット${i}: ${slot.name} x${slot.count}`);
            itemCount++;
          }
        }

        const totalSlots = containerEnd - containerStart;
        const emptySlots = totalSlots - itemCount;
        console.log(`  空き: ${emptySlots}/${totalSlots}`);
      }

    } catch (err) {
      console.log(`✗ エラー: ${err.message}`);
      console.log(err.stack);
    }

    chest.close();
    console.log('\n=== テスト完了 ===\n');
    bot.chat('テスト完了');

  } catch (err) {
    console.error('テストエラー:', err);
    bot.chat(`エラー: ${err.message}`);
  }
});

bot.on('error', (err) => {
  console.error('Botエラー:', err);
});

bot.on('end', () => {
  console.log('Bot終了');
  process.exit(0);
});

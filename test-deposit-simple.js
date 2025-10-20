// 最小限のdeposit()テスト
import { createBot } from 'mineflayer';

const bot = createBot({
  host: '127.0.0.1',
  port: 25565,
  username: 'deposit_test',
  auth: 'offline'
});

bot.once('spawn', () => {
  console.log('スポーン完了。testと入力してください');
});

bot.on('chat', async (username, msg) => {
  if (msg !== 'test') return;

  try {
    const mcData = require('minecraft-data')(bot.version);
    const chestDef = mcData.blocksByName['chest'];
    const block = bot.findBlock({ matching: [chestDef.id], maxDistance: 6 });

    if (!block) {
      console.log('チェストが見つかりません');
      return;
    }

    const chest = await bot.openChest(block);
    console.log('チェストを開きました');

    const items = bot.inventory.items();
    if (items.length === 0) {
      console.log('インベントリが空です');
      chest.close();
      return;
    }

    const item = items[0];
    console.log(`\nテスト: ${item.name} x${item.count} (type:${item.type}, slot:${item.slot})`);
    console.log(`格納前の全アイテム:`);
    bot.inventory.items().forEach(i => console.log(`  ${i.name}@スロット${i.slot}: ${i.count}個`));

    console.log('\ndeposit実行中...');
    try {
      await chest.deposit(item.type, null, item.count);
      console.log('deposit完了');
    } catch (err) {
      console.log('depositエラー:', err.message);
    }

    await new Promise(r => setTimeout(r, 500));

    console.log(`\n格納後の全アイテム:`);
    bot.inventory.items().forEach(i => console.log(`  ${i.name}@スロット${i.slot}: ${i.count}個`));

    const afterItem = bot.inventory.items().find(i => i.slot === item.slot);
    console.log(`\nスロット${item.slot}の変化: ${item.count}個 → ${afterItem ? afterItem.count : 0}個`);
    console.log(`実際に減った数: ${item.count - (afterItem ? afterItem.count : 0)}個\n`);

    chest.close();
    bot.chat('test done');
  } catch (err) {
    console.error('エラー:', err);
  }
});

bot.on('error', console.error);

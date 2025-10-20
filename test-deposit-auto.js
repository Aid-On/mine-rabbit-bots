// 自動実行版deposit()テスト
import { createBot } from 'mineflayer';
import minecraftData from 'minecraft-data';

const bot = createBot({
  host: '127.0.0.1',
  port: 25565,
  username: 'deposit_test',
  auth: 'offline'
});

bot.once('spawn', async () => {
  console.log('✓ スポーン完了');

  // 3秒待ってから自動実行
  await new Promise(r => setTimeout(r, 3000));

  console.log('\n=== 自動テスト開始 ===\n');

  try {
    const mcData = minecraftData(bot.version);
    const chestDef = mcData.blocksByName['chest'];
    const block = bot.findBlock({ matching: [chestDef.id], maxDistance: 6 });

    if (!block) {
      console.log('✗ 近くにチェストが見つかりません（6ブロック以内）');
      console.log('テストを終了します');
      process.exit(1);
    }

    console.log(`✓ チェスト発見: ${block.position}`);

    const chest = await bot.openChest(block);
    await new Promise(r => setTimeout(r, 500));
    console.log('✓ チェストを開きました');

    const items = bot.inventory.items();
    if (items.length === 0) {
      console.log('✗ インベントリが空です');
      console.log('テストするにはBotのインベントリにアイテムを入れてください');
      chest.close();
      process.exit(1);
    }

    console.log(`\n✓ インベントリ: ${items.length}種類のアイテム`);

    const item = items[0];
    console.log(`\n--- テスト対象 ---`);
    console.log(`アイテム: ${item.name}`);
    console.log(`数: ${item.count}個`);
    console.log(`タイプID: ${item.type}`);
    console.log(`スロット: ${item.slot}`);

    console.log(`\n--- 格納前の状態 ---`);
    console.log('Botインベントリ:');
    bot.inventory.items().slice(0, 5).forEach(i => {
      console.log(`  スロット${i.slot}: ${i.name} x${i.count}`);
    });
    if (items.length > 5) console.log(`  ... 他${items.length - 5}個`);

    console.log('\n--- deposit実行 ---');
    console.log(`chest.deposit(${item.type}, null, ${item.count})`);

    try {
      await chest.deposit(item.type, null, item.count);
      console.log('✓ deposit完了（エラーなし）');
    } catch (err) {
      console.log(`✗ depositエラー: ${err.message}`);
      console.error(err);
    }

    await new Promise(r => setTimeout(r, 500));

    console.log(`\n--- 格納後の状態 ---`);
    console.log('Botインベントリ:');
    const afterItems = bot.inventory.items();
    afterItems.slice(0, 5).forEach(i => {
      console.log(`  スロット${i.slot}: ${i.name} x${i.count}`);
    });
    if (afterItems.length > 5) console.log(`  ... 他${afterItems.length - 5}個`);

    const afterItem = afterItems.find(i => i.slot === item.slot);
    const moved = item.count - (afterItem ? afterItem.count : 0);

    console.log(`\n--- 結果 ---`);
    console.log(`スロット${item.slot}: ${item.count}個 → ${afterItem ? afterItem.count : 0}個`);
    console.log(`実際に移動: ${moved}個`);

    if (moved > 0) {
      console.log(`✓ テスト成功: ${moved}個が格納されました`);
    } else if (moved === 0) {
      console.log(`✗ テスト失敗: アイテムが移動していません`);
    } else {
      console.log(`✗ テスト異常: アイテムが増えています（${moved}個）`);
    }

    chest.close();
    console.log('\n=== テスト終了 ===\n');

    process.exit(moved > 0 ? 0 : 1);

  } catch (err) {
    console.error('テストエラー:', err);
    process.exit(1);
  }
});

bot.on('error', (err) => {
  console.error('Botエラー:', err.message);
});

bot.on('end', () => {
  console.log('Bot終了');
});

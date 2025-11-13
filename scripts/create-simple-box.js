#!/usr/bin/env node
/**
 * 3x3x3の石の箱を手動で作成
 */
import { Schematic } from 'prismarine-schematic';
import { writeFile, mkdir } from 'fs/promises';
import minecraftData from 'minecraft-data';
import { Vec3 } from 'vec3';

const version = '1.20.1';
const mcData = minecraftData(version);

console.log('3x3x3の石の箱を作成中...');

// 新しいSchematicを作成
const schematic = new Schematic(version);

// offsetとsizeを設定
schematic.offset = new Vec3(0, 0, 0);
schematic.size = new Vec3(3, 3, 3);

// blocksとpaletteを初期化
schematic.blocks = new Array(3 * 3 * 3).fill(0); // 0 = air
schematic.palette = [0]; // palette[0] = air (state 0)

// ブロックを取得
const stoneBlock = mcData.blocksByName['stone'];

// 3x3x3の範囲にブロックを配置
for (let x = 0; x < 3; x++) {
  for (let y = 0; y < 3; y++) {
    for (let z = 0; z < 3; z++) {
      const pos = new Vec3(x, y, z);
      // setBlock(pos, block)を使用
      schematic.setBlock(pos, stoneBlock);
    }
  }
}

// ファイルに保存
const outputPath = './schematics/stone-box.schem';

try {
  await mkdir('./schematics', { recursive: true });
  const buffer = await schematic.write();
  await writeFile(outputPath, buffer);

  console.log(`✓ 石の箱を作成しました: ${outputPath}`);
  console.log('  サイズ: 3x3x3');
  console.log('  ブロック: 石 x 27個');
  console.log('\nゲーム内で試してください:');
  console.log('  !buildinfo stone-box.schem');
  console.log('  !build stone-box.schem north');
} catch (error) {
  console.error('エラー:', error.message);
  console.error(error.stack);
  process.exit(1);
}

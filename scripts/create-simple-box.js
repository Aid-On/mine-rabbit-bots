#!/usr/bin/env node
/**
 * 5x4x5の簡単な小屋を手動で作成
 * - 床: 石
 * - 壁: 丸石（中は空洞）
 * - ドア: 前面に1つ
 */
import { Schematic } from 'prismarine-schematic';
import { writeFile, mkdir } from 'fs/promises';
import minecraftData from 'minecraft-data';
import { Vec3 } from 'vec3';

const version = '1.20.1';
const mcData = minecraftData(version);

const width = 5;
const height = 4;
const length = 5;

console.log(`${width}x${height}x${length}の小屋を作成中...`);

// 新しいSchematicを作成
const schematic = new Schematic(version);

// offsetとsizeを設定
schematic.offset = new Vec3(0, 0, 0);
schematic.size = new Vec3(width, height, length);

// blocksとpaletteを初期化
schematic.blocks = new Array(width * height * length).fill(0); // 0 = air
schematic.palette = [0]; // palette[0] = air (state 0)

// ブロックを取得
const stoneBlock = mcData.blocksByName['stone'];
const cobblestoneBlock = mcData.blocksByName['cobblestone'];
const oakPlanksBlock = mcData.blocksByName['oak_planks'];

// 床を作る (y=0, 石)
for (let x = 0; x < width; x++) {
  for (let z = 0; z < length; z++) {
    const pos = new Vec3(x, 0, z);
    schematic.setBlock(pos, stoneBlock);
  }
}

// 壁を作る (丸石, y=1,2,3)
for (let y = 1; y < height; y++) {
  // 前後の壁
  for (let x = 0; x < width; x++) {
    schematic.setBlock(new Vec3(x, y, 0), cobblestoneBlock); // 前
    schematic.setBlock(new Vec3(x, y, length - 1), cobblestoneBlock); // 後ろ
  }
  // 左右の壁
  for (let z = 1; z < length - 1; z++) {
    schematic.setBlock(new Vec3(0, y, z), cobblestoneBlock); // 左
    schematic.setBlock(new Vec3(width - 1, y, z), cobblestoneBlock); // 右
  }
}

// ドアを作る (前の壁の中央をくり抜く, y=1,2)
const doorX = Math.floor(width / 2);
schematic.setBlock(new Vec3(doorX, 1, 0), mcData.blocksByName['air']);
schematic.setBlock(new Vec3(doorX, 2, 0), mcData.blocksByName['air']);

// 屋根を作る (オークの板材, y=3)
for (let x = 0; x < width; x++) {
  for (let z = 0; z < length; z++) {
    schematic.setBlock(new Vec3(x, height - 1, z), oakPlanksBlock);
  }
}

// ファイルに保存
const outputPath = './schematics/simple-house.schem';

try {
  await mkdir('./schematics', { recursive: true });
  const buffer = await schematic.write();
  await writeFile(outputPath, buffer);

  // ブロック数をカウント
  let blockCount = 0;
  for (let i = 0; i < schematic.blocks.length; i++) {
    if (schematic.blocks[i] !== 0) blockCount++;
  }

  console.log(`✓ 簡単な小屋を作成しました: ${outputPath}`);
  console.log(`  サイズ: ${width}x${height}x${length}`);
  console.log(`  ブロック数: ${blockCount}個`);
  console.log('  構造:');
  console.log('    - 床: 石');
  console.log('    - 壁: 丸石（中は空洞）');
  console.log('    - 屋根: オークの板材');
  console.log('    - ドア: 前面中央');
  console.log('\nゲーム内で試してください:');
  console.log('  !buildinfo simple-house.schem');
  console.log('  !build simple-house.schem north');
} catch (error) {
  console.error('エラー:', error.message);
  console.error(error.stack);
  process.exit(1);
}

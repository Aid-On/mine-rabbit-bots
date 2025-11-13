/**
 * construct アクション: .schematic / .litematic ファイルから建築を行う
 */
import { loadSchematic, getMaterialsFromSchematic, checkMaterials, buildSchematic, getSchematicInfo } from '../lib/builder.js';
import { resolve } from 'path';
import { Vec3 } from 'vec3';

export function register(bot, commandHandlers, ctx) {
  // 建築状態管理
  const buildState = {
    isBuilding: false,
    currentSchematic: null,
    currentFile: null
  };

  /**
   * build <file> [facing] - .schematic ファイルから建築
   * facing: north, south, east, west (デフォルト: north)
   */
  commandHandlers.set('build', ({ args, sender }) => {
    const hasHelp = (arr) => (arr || []).some(a => ['-h','--help','help','ヘルプ'].includes(String(a||'').toLowerCase()));

    if (hasHelp(args) || args.length === 0) {
      bot.chat('建築: .schematic/.litematic ファイルから建物を建築します');
      bot.chat('使用: build <file> [north|south|east|west]');
      bot.chat('例: build house.schematic north');
      bot.chat('例: build castle.litematic east');
      bot.chat('設計書は schematics/ ディレクトリに配置してください');
      return;
    }

    if (buildState.isBuilding) {
      bot.chat('既に建築中です。中断するには buildstop を実行してください');
      return;
    }

    const fileName = args[0];
    const facing = (args[1] || 'north').toLowerCase();

    if (!['north', 'south', 'east', 'west'].includes(facing)) {
      bot.chat('方向は north, south, east, west のいずれかを指定してください');
      return;
    }

    (async () => {
      try {
        // ファイルパスを解決
        const filePath = resolve(process.cwd(), 'schematics', fileName);
        ctx.log?.(`設計書を読み込み中: ${filePath}`);
        bot.chat('設計書を読み込んでいます...');

        // schematic を読み込み
        const schematic = await loadSchematic(bot, filePath);
        const info = getSchematicInfo(schematic);

        bot.chat(`設計書: ${fileName} (${info.size.x}x${info.size.y}x${info.size.z}, ${info.blockCount}ブロック)`);

        // 必要な材料をチェック
        const materials = getMaterialsFromSchematic(schematic, ctx.mcData());
        const check = checkMaterials(bot, materials);

        if (!check.hasAll) {
          bot.chat('材料が不足しています:');
          for (const [blockName, count] of Object.entries(check.missing)) {
            bot.chat(`  ${ctx.getJaItemName(blockName)}: ${count}個不足`);
          }
          bot.chat('材料を揃えてから再度実行してください');
          return;
        }

        bot.chat('材料チェック完了。建築を開始します...');

        // 建築位置は現在のボット位置
        const buildPos = bot.entity.position.floored();

        buildState.isBuilding = true;
        buildState.currentSchematic = schematic;
        buildState.currentFile = fileName;

        // 建築実行
        await buildSchematic(bot, schematic, buildPos, ctx, {
          facing,
          onProgress: (placed, total) => {
            if (placed % 10 === 0 || placed === total) {
              ctx.log?.(`建築進捗: ${placed}/${total} (${Math.floor((placed/total)*100)}%)`);
            }
          }
        });

        bot.chat(`建築完了: ${fileName}`);
        buildState.isBuilding = false;
        buildState.currentSchematic = null;
        buildState.currentFile = null;

      } catch (error) {
        ctx.log?.(`建築エラー: ${error.message}`);
        bot.chat(`建築エラー: ${error.message}`);
        buildState.isBuilding = false;
        buildState.currentSchematic = null;
        buildState.currentFile = null;
      }
    })();
  });

  /**
   * buildinfo <file> - .schematic ファイルの情報を表示
   */
  commandHandlers.set('buildinfo', ({ args, sender }) => {
    if (args.length === 0) {
      bot.chat('使用: buildinfo <file>');
      return;
    }

    const fileName = args[0];

    (async () => {
      try {
        const filePath = resolve(process.cwd(), 'schematics', fileName);
        const schematic = await loadSchematic(bot, filePath);
        const info = getSchematicInfo(schematic);

        bot.chat(`設計書: ${fileName}`);
        bot.chat(`サイズ: ${info.size.x}x${info.size.y}x${info.size.z}`);
        bot.chat(`ブロック数: ${info.blockCount}個`);

        // 必要な材料
        const materials = getMaterialsFromSchematic(schematic, ctx.mcData());
        bot.chat('必要な材料:');

        let count = 0;
        for (const [blockName, amount] of Object.entries(materials)) {
          if (count >= 5) {
            bot.chat(`  ... 他 ${Object.keys(materials).length - 5} 種類`);
            break;
          }
          bot.chat(`  ${ctx.getJaItemName(blockName)}: ${amount}個`);
          count++;
        }

        // 在庫チェック
        const check = checkMaterials(bot, materials);
        if (check.hasAll) {
          bot.chat('材料は揃っています');
        } else {
          bot.chat('不足している材料があります');
        }

      } catch (error) {
        ctx.log?.(`情報取得エラー: ${error.message}`);
        bot.chat(`エラー: ${error.message}`);
      }
    })();
  });

  /**
   * buildstop - 建築を中断
   */
  commandHandlers.set('buildstop', ({ args, sender }) => {
    if (!buildState.isBuilding) {
      bot.chat('建築中ではありません');
      return;
    }

    bot.chat(`建築を中断しました: ${buildState.currentFile || ''}`);
    buildState.isBuilding = false;
    buildState.currentSchematic = null;
    buildState.currentFile = null;
  });

  /**
   * buildstatus - 建築状態を表示
   */
  commandHandlers.set('buildstatus', ({ args, sender }) => {
    if (buildState.isBuilding) {
      bot.chat(`建築中: ${buildState.currentFile || '不明'}`);
    } else {
      bot.chat('建築中ではありません');
    }
  });
}

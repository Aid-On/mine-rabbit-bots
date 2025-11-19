/**
 * construct アクション: .schem / .json ファイルから建築を行う
 */
import { loadSchematic, getMaterialsFromSchematic, checkMaterials, buildSchematic, getSchematicInfo } from '../lib/builder.js';
import { resolve } from 'path';
import { Vec3 } from 'vec3';

export function register(bot, commandHandlers, ctx) {
  // 建築状態管理
  const buildState = {
    isBuilding: false,
    currentSchematic: null,
    currentFile: null,
    last: null, // { schematic, file, pos, facing }
    // 自動監視
    watchEnabled: false,
    watchIntervalMs: 60000,
    watchTimer: null,
    isRepairing: false
  };

  /**
   * build <file> [facing] - .schematic ファイルから建築
   * facing: north, south, east, west (デフォルト: north)
   */
  commandHandlers.set('build', ({ args, sender }) => {
    const hasHelp = (arr) => (arr || []).some(a => ['-h','--help','help','ヘルプ'].includes(String(a||'').toLowerCase()));

    if (hasHelp(args) || args.length === 0) {
      bot.chat('建築: .json/.schem ファイルから建物を建築します');
      bot.chat('使用: build <file> [north|south|east|west]');
      bot.chat('例: build simple-house.json north');
      bot.chat('例: build castle.schem east');
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
            const available = check.available[blockName] || 0;
            const required = materials[blockName] || 0;
            bot.chat(`  ${ctx.getJaItemName(blockName)}: ${available}/${required} (${count}個不足)`);
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
          shouldCancel: () => !buildState.isBuilding,
          onProgress: (placed, total) => {
            if (placed % 10 === 0 || placed === total) {
              ctx.log?.(`建築進捗: ${placed}/${total} (${Math.floor((placed/total)*100)}%)`);
            }
          }
        });

        const wasCanceled = !buildState.isBuilding;
        if (wasCanceled) {
          bot.chat(`建築を中断しました: ${fileName}`);
        } else {
          bot.chat(`建築完了: ${fileName}`);
        }
        buildState.isBuilding = false;
        buildState.currentSchematic = null;
        buildState.currentFile = null;
        // 記録: 後で検査/修復を再実行できるように保存
        if (!wasCanceled) {
          buildState.last = { schematic, file: fileName, pos: buildPos.clone(), facing };
        }
        // ウォッチが有効なら起動
        if (buildState.watchEnabled && !buildState.watchTimer) {
          startWatch();
        }

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
   * buildrepair - 直前の建築位置を検査して不足/誤設置を修復
   */
  commandHandlers.set('buildrepair', ({ args, sender }) => {
    if (buildState.isBuilding) {
      bot.chat('建築中のため修復は実行できません');
      return;
    }
    const last = buildState.last;
    if (!last || !last.schematic || !last.pos) {
      bot.chat('直前の建築情報がありません。先に build を実行してください');
      return;
    }
    (async () => {
      try {
        buildState.isRepairing = true;
        bot.chat(`修復を開始: ${last.file} の建築位置を検査中...`);
        await buildSchematic(bot, last.schematic, last.pos, ctx, {
          facing: last.facing || 'north',
          shouldCancel: () => !buildState.isRepairing,
          onProgress: (p, t) => { if (p % 10 === 0 || p === t) ctx.log?.(`修復進捗: ${p}/${t}`); }
        });
        bot.chat('修復完了');
      } catch (error) {
        ctx.log?.(`修復エラー: ${error.message}`);
        bot.chat(`修復エラー: ${error.message}`);
      } finally {
        buildState.isRepairing = false;
      }
    })();
  });

  // 内部: 直前建築に対する検査・修復を実行（重複防止）
  const runRepairAtLast = async () => {
    if (buildState.isRepairing || buildState.isBuilding) return;
    const last = buildState.last;
    if (!last || !last.schematic || !last.pos) return;
    buildState.isRepairing = true;
    try {
      await buildSchematic(bot, last.schematic, last.pos, ctx, {
        facing: last.facing || 'north',
        onProgress: (p, t) => { if (p === t) ctx.log?.('自動監視: 修復パス完了'); }
      });
    } catch (e) {
      ctx.log?.(`自動監視エラー: ${e.message}`);
    } finally {
      buildState.isRepairing = false;
    }
  };

  const startWatch = () => {
    if (buildState.watchTimer) return;
    buildState.watchTimer = setInterval(runRepairAtLast, buildState.watchIntervalMs);
    try { bot.chat(`自動監視を開始: 間隔 ${Math.floor(buildState.watchIntervalMs/1000)} 秒`); } catch (_) {}
  };
  const stopWatch = () => {
    if (buildState.watchTimer) {
      clearInterval(buildState.watchTimer);
      buildState.watchTimer = null;
    }
    try { bot.chat('自動監視を停止'); } catch (_) {}
  };

  /**
   * buildwatch <start|stop|status> [intervalSec]
   *  直前建築の位置を定期的に検査・修復します
   */
  commandHandlers.set('buildwatch', ({ args, sender }) => {
    const sub = (args[0]||'').toLowerCase();
    if (!sub || ['-h','--help','help','ヘルプ'].includes(sub)) {
      bot.chat('使用: buildwatch <start|stop|status> [intervalSec]');
      return;
    }
    if (sub === 'status') {
      const st = buildState.watchTimer ? 'running' : (buildState.watchEnabled ? 'enabled' : 'disabled');
      bot.chat(`自動監視: ${st}, 間隔 ${Math.floor(buildState.watchIntervalMs/1000)} 秒`);
      return;
    }
    if (sub === 'start') {
      const sec = Number(args[1]||'');
      if (!Number.isNaN(sec) && sec > 1) buildState.watchIntervalMs = sec*1000;
      buildState.watchEnabled = true;
      startWatch();
      return;
    }
    if (sub === 'stop') {
      buildState.watchEnabled = false;
      stopWatch();
      return;
    }
    bot.chat('使用: buildwatch <start|stop|status> [intervalSec]');
  });

  /**
   * buildstop - 建築を中断
   */
  commandHandlers.set('buildstop', ({ args, sender }) => {
    if (!buildState.isBuilding) {
      // 建築していない場合は修復の中断を試みる
      if (buildState.isRepairing) {
        buildState.isRepairing = false;
        bot.chat('修復を中断しました');
        return;
      }
      bot.chat('建築中ではありません');
      return;
    }

    bot.chat(`建築を中断します: ${buildState.currentFile || ''}`);
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

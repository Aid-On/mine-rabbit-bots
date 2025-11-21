# チェストの仕組み（現行実装）

近くのチェスト（chest / trapped_chest）を見つけて開き、所持品の格納（deposit）や取得（withdraw）を行います。チャットコマンド層とロジック層を分離し、失敗時は明確なメッセージで通知します。

## 全体像
- 探索→接近→オープン: 近距離（6）→遠距離（48）の順で探索。遠距離で見つかれば接近してから開封。
- ウィンドウ確定待ち: 開封後300ms待ち→最大3秒 `chest.window` を待機→未確定ならクローズしてエラー。
- 格納ロジック: 空きと既存スタックを解析し、積み増せるアイテムを優先格納。失敗時はフォールバックも実施。
- 排他制御: 複数のチェスト操作が重ならないようロック（`acquireLock('chest')`）。
- 結果通知: 例外はコマンド側で捕捉し `失敗: <理由>` をチャット通知。

## 対応ファイル
- `src/actions/chest.js`: コマンド群（list / find / store / take / dump）
- `src/lib/containers.js`: 探索・開封（`findNearestChest` / `openNearestChest`）
- `src/lib/chest-operations.js`: 解析・優先度付け・格納（depositAllItems / depositItem など）
- `src/lib/utils.js`: 軽量ロック（`acquireLock`）
- `test-chest.js`, `test-chest-operations.test.js`: 実機/ユニットテスト

## スロットレイアウト（Window 視点）
- `0-26`: チェスト（コンテナ）
- `27-53`: インベントリ
- `54-62`: ホットバー
- `45`: オフハンド

注意:
- `bot.inventory.items()` はプレイヤー視点スロット、`bot.clickWindow()` はウィンドウスロット。
- `chest.deposit(type, meta, count)` はアイテムID指定で投入（内部で適切スロットへ）。

## コマンド仕様（抜粋）
- `chest list`: 中身を一覧表示（種類と合計数）
- `chest find <キーワード>`: 英名/日本語名の部分一致検索
- `chest store <アイテム>`: 指定アイテムを格納
- `chest store -a`: 全アイテム一括格納（ロック使用）
- `chest store -kh/-ka/-ko`: ホットバー以外/装備以外/オフハンド以外を格納（ロック使用）
- `chest take <アイテム> [個数]`: 指定取得（`all|*|全部` で全量）
- `chest take -a`: 全取得
- `chest take -f <検索>`: 検索して取得

すべて `openNearestChest()` で開封し、処理後は `chest.close()` します。開封失敗は例外となり、コマンドが `失敗: ...` を出力します。

## 探索・開封（containers.js）
- `chestBlockIds(mcData)`: chest / trapped_chest のID収集
- `findNearestChest(bot, mcData, maxDistance)`: 近傍探索
- `openNearestChest(bot, mcData, gotoBlock, { near=6, far=48 })`:
  - near優先→farで再探索。farヒット時は `gotoBlock` で接近
  - `bot.openChest(block)` → 300ms待機 → 最大3秒で `chest.window` 確定待ち
  - 未確定なら `close()` して `Error('チェストのウィンドウを開けませんでした（タイムアウト）')`

## 格納アルゴリズム（chest-operations.js）
- `analyzeChest(chest)`: コンテナ内を走査し、空きスロットと「タイプ別の積み増し可能数」を算出
- `getExcludedSlots(bot)`: 手持ち・装備（head/torso/legs/feet）・オフハンド(45)を除外
- `sortItemsByPriority(items, stackableSpace)`: 積み増し可能量が多い順に優先
- `depositItem({ bot, chest, item, log })`:
  - 事前検証: `!chest.window` / `!bot.currentWindow` ならメッセージ付きで失敗返却
  - 小分けで `chest.deposit(...)` を試行（進捗なければ打ち切り）
  - フォールバック: シフトクリック搬送（`clickWindow`）を試し、移動数を前後差で推定
  - 返り値: `{ success, moved, error? }`
- `depositAllItems({ bot, chest, getJaItemName, log })`:
  - 最大5ラウンド。ラウンド冒頭で `!chest.window` なら安全終了
  - ラウンドごとに `analyzeChest` で状態更新、優先度順に投入
  - 進捗が無いラウンドで終了

## 排他制御（ロック）
- `acquireLock('chest')` により、同時実行を防止（`store -a/-kh/-ka/-ko`, `dump/all` などで使用）

## 例外・注意点
- 対象ブロック: chest / trapped_chest のみ（barrelは未対応。拡張可）
- 開封条件: チェスト上面が固体ブロックで塞がれていると開かない
- 距離/到達: 遠距離で見つかった場合は接近してから開封
- タイムアウト: 開封から最大3秒で `chest.window` 未確定ならエラー

## テスト
- 実機: `node test-chest.js`（ワールド内で `test` と発言）
- ユニット: `node test-chest-operations.test.js`
- 参考: `TESTING.md`（スロットレイアウト/ロジック解説）

## 拡張のヒント
- 対象に `barrel` を追加（`containers.js` の `chestBlockIds`）
- 開封のタイムアウト・待機時間の調整
- ログの粒度制御（本番では詳細ログを抑制）

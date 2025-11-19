# チェストの仕組み

本リポジトリにおける「チェスト」機能の構成と動作をまとめます。近くのチェストを発見・接近・オープンし、所持品を格納（deposit）/取得（withdraw）します。チャットコマンドからの操作と、ビジネスロジック（安全な格納アルゴリズム）を分離しています。

## 概要
- 探索: 近距離→遠距離の順にチェストを探索（`chest`/`trapped_chest`）。遠距離で見つかった場合は移動して開く。
- オープン: `mineflayer` の `bot.openChest(block)` で GUI を開く（少し待機）
- 格納/取得: 背景ロジックで空きスロット/同種スタックを優先して投入。取得は指定/全量/検索が可能。
- 排他制御: チャット由来のチェスト操作はロックで直列化。
- クローズ: 完了後は `chest.close()` で明示的に閉じる。

## 関連ファイル
- `src/actions/chest.js`: チャットコマンド実装（list / find / store / take）
- `src/lib/containers.js`: チェスト探索・オープン（`findNearestChest` / `openNearestChest`）
- `src/lib/chest-operations.js`: ビジネスロジック（在庫分析・優先度付け・確実な投入）
- `src/lib/utils.js`: 軽量ロック（`acquireLock('chest')`）
- `test-chest.js`: 実機テスト用スクリプト（スロットや動作の可視化）
- `test-chest-operations.test.js`: ロジックのユニットテスト

## スロットレイアウト（Window 視点）
Mineflayer のウィンドウ（`chest.window`）が持つスロットと、プレイヤーインベントリのスロットは番号体系が異なります。

- `Slots 0-26` : チェスト本体（コンテナ）
- `Slots 27-53`: プレイヤーインベントリ（上段）
- `Slots 54-62`: ホットバー
- `Slot 45`    : オフハンド

注意点:
- `bot.inventory.items()` はプレイヤー視点のスロット（0-35/36-44/45）を返します。
- `chest.deposit()` はアイテムID/メタデータ/個数で投入します（内部で適切なスロットへ）。
- 低レベル操作として `bot.clickWindow(windowSlot, 0, 1)` を使う場合は Window スロット番号に変換が必要です。

参考: `TESTING.md` の「Window Slot Layout」節

## チャットコマンド
`src/actions/chest.js`

- `chest list`: チェストの中身を一覧表示（種類と合計数を集計）
- `chest find <キーワード>`: 英名/日本語名の部分一致で検索
- `chest store <アイテム>`: 指定アイテムを格納
- `chest store -a`: 全アイテムを一括格納
- `chest store -kh`: ホットバー以外を格納
- `chest store -ka`: 防具・装備（頭/胴/脚/足）以外を格納
- `chest store -ko`: オフハンド以外を格納
- `chest take <アイテム> [個数]`: 指定アイテムを取得（`all|*|全部` 指定で全量）
- `chest take -a`: 全アイテムを取得
- `chest take -f <検索クエリ>`: 検索して一致アイテムを取得

内部的には `openNearestChest()` でチェストを開き、必要に応じて 200–300ms 程度の待機後に処理します。

## チェスト探索とオープン
`src/lib/containers.js`

- `chestBlockIds(mcData)`: `chest` / `trapped_chest` の Block ID を収集
- `findNearestChest(bot, mcData, maxDistance)`: 付近のチェスト Block を検索
- `openNearestChest(bot, mcData, gotoBlock, { near=6, far=48 })`:
  - まず近距離（near）で検索
  - 見つからない場合は遠距離（far）で検索し、`gotoBlock` が与えられていればその座標へ移動
  - `bot.openChest(block)` → 少し待機してウィンドウ確定 → `chest` を返す

## 格納アルゴリズム（概要）
`src/lib/chest-operations.js`

- `analyzeChest(chest)`: 
  - コンテナ内スロットを走査し、総スロット数・空きスロット数・同種スタックに積める残量（`stackableSpace`）を算出
- `getExcludedSlots(bot)`: 
  - 手持ち（held）/防具（head, torso, legs, feet）/オフハンド（45）などを除外
- `sortItemsByPriority(items, stackableSpace)`: 
  - 既存スタックに積み増せるアイテムを優先
- `depositItem({ bot, chest, item })`:
  - まず `chest.deposit(type, metadata, chunk)` を小分けで試行（例外時はフォールバック）
  - 進捗が無い場合は `bot.clickWindow(windowSlot, 0, 1)` によるシフトクリック搬送を試みる
  - 実移動数を前後比較で推定し、失敗時は 0 を返す
- `depositAllItems({ bot, chest, getJaItemName, log })`:
  - 最大 5 ラウンド繰り返し
  - 毎ラウンドでチェスト状態を再分析し、優先度順に投入
  - ラウンドで進捗が無ければ終了（フルや非スタック品で詰まるのを回避）

実装は「一部だけ入る」「スタックへ積み増す」「満杯時にスキップ」など、現実的なケースを考慮しています。

## 排他制御（ロック）
- チャットコマンド由来のチェスト操作は `src/lib/utils.js` の `acquireLock('chest')` を使用して直列化しています。
- これにより複数プレイヤーや別コマンドからの同時操作で GUI が壊れるのを防ぎます。
- 旧コードには `src/bot.js` 内の `chestBusy` も存在しますが、現在のアクションは `utils` のロックを使用しています。

## 例外・注意点
- ウィンドウ未確定: `openChest` 直後は `chest.window` が `undefined` の場合があるため、少し待機してから操作しています。
- スロット体系の違い: `inventory` のスロット番号と `window` のスロット番号は異なるため、低レベル操作時は変換が必要です。
- 満杯時: `depositAllItems` は空き/スタック可能スペースが無いときはスキップし、ログに記録します。
- リトライ方針: 小分け投入やシフトクリックのフォールバックで、サーバー遅延や不安定さに耐性を持たせています。

## テスト/デバッグ
- 実機テスト: `node test-chest.js`（ワールド内で `test` とチャット入力）
- 簡易起動: `./run-test-chest.sh`
- ユニットテスト（ロジック）: `node test-chest-operations.test.js`
- スロット/レイアウトの参考: `TESTING.md` の「Window Slot Layout」「Business Logic」

## よくある拡張ポイント
- コンテナ種の追加: `containers.js` の `chestBlockIds` に `barrel` 等を追加
- 自動格納の条件強化: 例）特定タグ/名前のアイテムのみ格納、しきい値で残す等
- 自動取得の拡張: `take -f` のクエリ解釈を正規表現や日本語別名に対応

以上。実装の詳細は各ファイルの該当関数を参照してください。


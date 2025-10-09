# Mineflyer Sandbox

このプロジェクトは、Craftsman とは独立した Mineflyer 専用のサーバー検証・設定用サンドボックスです。

## 目的
- Paper サーバー（オフライン認証）上で Mineflyer を動作検証する
- プラグインや設定ファイルを安全に実験し、本番運用前に確認する
- バックアップやワールドデータを分離し、Craftsman 本体への影響を抑える

## ディレクトリ構成（推奨）
```
mineflyer-sandbox/
  README.md            … このファイル
  data/                … サーバーデータ（world, plugins など）
  backups/             … 手動で取得したバックアップ置き場
  scripts/             … 起動・停止・メンテナンス用スクリプト
  notes/               … 設定や検証結果のメモ
```

必要に応じて `craftsman` 側で作成済みの `mineflyer-vanilla` Pak のデータをコピーしたり、Paper の各種設定ファイルをここで管理してください。

## 次のステップ
1. `data/` 以下に Paper サーバーの初期データを配置するか、`craftsman` の `data/paks/mineflyer-vanilla/data` から構成をコピーします。
2. プラグインや Mineflyer 用のスクリプトを追加して検証します。
3. 安定したら Craftsman 側の Pak に反映するか、別途自動化フローを整備してください。

---
このリポジトリはバージョン管理用の空箱です。自由にディレクトリやファイルを追加して Mineflyer 環境の整備にお使いください。

## Bot の起動方法

1. 依存関係のセットアップ（初回のみ）
   ```bash
   npm install
   ```
2. 環境変数を必要に応じて設定し、Paper サーバー（例: `craftsman` の `mineflyer-vanilla`）を起動します。
3. Bot を起動
   ```bash
   npm start
   ```

### 環境変数
| 変数名               | 既定値        | 説明 |
| -------------------- | ------------- | ---- |
| `MINEFLYER_HOST`     | `127.0.0.1`   | 接続先サーバーのホスト名 |
| `MINEFLYER_PORT`     | `25565`       | サーバーのポート |
| `MINEFLYER_USERNAME` | `pino`| Bot のプレイヤー名 |
| `MINEFLYER_VERSION`  | 自動検出      | 特定のバージョンを指定したい場合に設定 |

Bot はチャットで `!ping` と話しかけると `pong` と返答します。`Ctrl+C` で安全に終了します。

`.env` ファイルに対応しています（リポジトリ直下）。以下のいずれかの形式で設定できます。

- 推奨（ホストとポートを別々に指定）
  ```ini
  MINEFLYER_HOST=192.168.40.254
  MINEFLYER_PORT=25565
  ```
- 互換（ホストにポートを含めて指定）
  ```ini
  MINEFLYER_HOST=192.168.40.254:25565
 ```

いずれの形式も読み込まれます。`.env` は既存の環境変数を上書きしません。

## チャットコマンド（抜粋）

- `ping`: 生存確認（`pong` を返答）
- `come`: 呼び出し位置へ移動
- `follow`: 話しかけたプレイヤーを追従
- `stop`: 追従を停止
- `jump`: その場でジャンプ
- `items` / `inv`: Bot のインベントリ一覧を表示（`name x個数` を集計して出力）
- `build <blockName> [dir]`: 目の前などにブロックを設置（`dir`: `front|back|left|right`。既定は `front`）
- `dig <blockName> [count]`: 指定ブロックを近場から `count` 個掘る（無引数の従来動作は一時停止中）
  - 例: `dig stone 5`, `dig oak_log 2`
  - ブロック名は Minecraft の内部名（例: `stone`, `oak_log`, `coal_ore`）
- `mine <blockName> [count]`: `dig` のエイリアス
- `furnace <input|fuel|take> ...`: 近くのかまどに投入・取り出し
  - 例: `furnace input raw_iron 8`, `furnace fuel coal 8`, `furnace take output`
  - 近くにかまどが無い場合は付近を探索し、見つかれば近づいて操作します

- `craft <itemName> [count]`: 指定アイテムをクラフト
  - 例: `craft stick 8`, `craft torch 4`
  - 近距離に作業台（`crafting_table`）がある場合のみ使用（パス移動はしません）
  - 材料不足や依存素材の自動作成は行いません（在庫で作れる分のみ）
- `craftauto <itemName> [count]` / `craft+ <itemName> [count]`: 自動採集つきクラフト
  - 材料が足りなければ、作成可能な素材は再帰的にクラフト、基礎素材は採掘で収集（原木/石/砂/石炭など）
  - 近場の作業台が必要なレシピは近づいてからクラフト
  - 未対応の素材や見つからない場合は途中で中断し通知します
- `smeltauto <itemName> [count]` / `smelt <itemName> [count]`: 自動製錬
  - 例: `smeltauto iron_ingot 8`, `smelt glass 16`
  - 入力候補（例: iron_ingot ← raw_iron, glass ← sand など）を所持/採集から確保し、燃料（石炭/木炭）も自動投入して製錬
  - 近くにかまどが無い場合は探索し接近して使用（未発見時は中断）

注意:
- 近くに該当ブロックがない場合や、到達できない地形の場合はスキップまたは中断します。
- ブロックがツール必須の場合は、インベントリから適切なツールに自動持ち替えして掘ります。ツール未所持の場合は破壊しません。
### 日本語名のカスタマイズ
- インベントリ表示の日本語名は `data/ja-items.json`（任意）で上書きできます。
- 例: `{ "oak_planks": "オークの板材", "stick": "棒" }`
- ファイルが無い場合は内蔵の簡易辞書と英名（displayName）を表示します。
- チャットから編集・取り込みも可能です:
  - `jaadd <英名> <日本語名>` / `jadel <英名>` / `ja <英名>`
  - `jaload` … `data/ja-items.json` を再読み込み
  - `jaimport data/ja-items.csv` … CSV/TSV（`英名,日本語名`）を取り込み

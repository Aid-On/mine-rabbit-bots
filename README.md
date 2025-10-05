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

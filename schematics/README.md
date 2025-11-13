# Schematics ディレクトリ

このディレクトリには、ボットが建築するための `.schematic` / `.litematic` ファイルを配置します。

## 使い方

1. WorldEdit / Litematica などのツールで設計書ファイルを作成
2. このディレクトリに配置
3. ゲーム内で `!build <ファイル名>` を実行

## コマンド

### build
```
!build <file> [facing]
```
- 指定した .schematic / .litematic ファイルから建築を実行
- `facing`: 建築の向き (`north`, `south`, `east`, `west`)
- 例: `!build house.schematic north`
- 例: `!build castle.litematic east`

### buildinfo
```
!buildinfo <file>
```
- .schematic / .litematic ファイルの情報を表示
- サイズ、ブロック数、必要な材料を確認できます
- 例: `!buildinfo house.schematic`
- 例: `!buildinfo tower.litematic`

### buildstatus
```
!buildstatus
```
- 現在の建築状態を表示

### buildstop
```
!buildstop
```
- 建築を中断

### place
```
!place <blockName> [direction]
```
- 単一ブロックを指定位置に設置
- 例: `!place cobblestone front`

## 設計書ファイルの作成方法

### WorldEdit を使う方法 (.schematic)

1. Minecraft で WorldEdit をインストール
2. 建築したい範囲を選択
   - `//pos1` と `//pos2` で範囲指定
3. Schematic として保存
   - `//copy` でコピー
   - `//schematic save <名前>` で保存
4. 保存された `.schematic` ファイルをこのディレクトリにコピー

### Litematica を使う方法 (.litematic) (推奨)

1. Fabric + Litematica Mod をインストール
2. ゲーム内で範囲を選択
   - `M` キーでメニューを開く
   - Area Editor で範囲を選択
3. Schematic として保存
   - Save Schematic で保存
4. 保存された `.litematic` ファイルをこのディレクトリにコピー
   - 通常 `.minecraft/schematics/` に保存されます

### オンラインツール

- [MCEdit](https://www.mcedit.net/) - Minecraft ワールドエディタ (.schematic)
- [Amulet Editor](https://www.amuletmc.com/) - 最新版対応エディタ (.litematic対応)

## 注意事項

- ボットのインベントリに必要な材料が揃っている必要があります
- 材料不足の場合は、`buildinfo` で確認してから材料を集めてください
- 大規模な建築は時間がかかります
- 建築中は他のコマンドの実行を控えてください

## サンプルファイル

サンプルファイルは以下から入手できます:

### .schematic 形式
- [Minecraft Schematics](https://www.minecraft-schematics.com/)
- [GrabCraft](https://www.grabcraft.com/)
- [Planet Minecraft](https://www.planetminecraft.com/resources/schematics/)

### .litematic 形式
- [Litematica Schematics](https://www.litematica.com/)
- プレイヤーが作成したものをコミュニティから入手

**注意**:
- `.schem` 形式（WorldEdit 1.13+）は現在未対応です
- `.schematic` （古い形式）と `.litematic` のみ対応しています

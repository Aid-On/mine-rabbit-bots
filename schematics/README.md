# Schematics ディレクトリ

このディレクトリには、ボットが建築するための `.schematic` ファイルを配置します。

## 使い方

1. WorldEdit などのツールで `.schematic` ファイルを作成
2. このディレクトリに配置
3. ゲーム内で `!build <ファイル名>` を実行

## コマンド

### build
```
!build <file> [facing]
```
- 指定した .schematic ファイルから建築を実行
- `facing`: 建築の向き (`north`, `south`, `east`, `west`)
- 例: `!build house.schematic north`

### buildinfo
```
!buildinfo <file>
```
- .schematic ファイルの情報を表示
- サイズ、ブロック数、必要な材料を確認できます
- 例: `!buildinfo house.schematic`

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

## .schematic ファイルの作成方法

### WorldEdit を使う方法 (推奨)

1. Minecraft で WorldEdit をインストール
2. 建築したい範囲を選択
   - `//pos1` と `//pos2` で範囲指定
3. Schematic として保存
   - `//copy` でコピー
   - `//schematic save <名前>` で保存
4. 保存された `.schematic` ファイルをこのディレクトリにコピー

### オンラインツール

- [MCEdit](https://www.mcedit.net/) - Minecraft ワールドエディタ
- [Amulet Editor](https://www.amuletmc.com/) - 最新版対応エディタ

## 注意事項

- ボットのインベントリに必要な材料が揃っている必要があります
- 材料不足の場合は、`buildinfo` で確認してから材料を集めてください
- 大規模な建築は時間がかかります
- 建築中は他のコマンドの実行を控えてください

## サンプル .schematic ファイル

サンプルファイルは以下から入手できます:
- [Minecraft Schematics](https://www.minecraft-schematics.com/)
- [GrabCraft](https://www.grabcraft.com/)
- [Planet Minecraft](https://www.planetminecraft.com/resources/schematics/)

**注意**: ダウンロードした .schematic ファイルは `.schem` 形式の場合があります。
mineflayer-builder は古い `.schematic` 形式をサポートしているため、必要に応じて変換してください。

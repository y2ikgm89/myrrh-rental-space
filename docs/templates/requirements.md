# 機能名 要件定義

> 一行説明

## 概要

[機能の目的・背景]

## 機能要件

### 公開ページ

- [要件1]
- [要件2]

### 管理画面

- [要件1]
- [要件2]

## データベース設計

詳細は [`DATABASE_DESIGN.md`](../architecture/DATABASE_DESIGN.md) を参照。

### テーブル名

| フィールド | 型     | 説明 |
| ---------- | ------ | ---- |
| id         | String | UUID |
| name       | String | 名前 |

## API

### Server Actions

- `createXxx` - 作成
- `updateXxx` - 更新
- `deleteXxx` - 削除

## セキュリティ

- 認証: [必要/不要]
- バリデーション: Zodスキーマ

## 参考資料

- [関連ドキュメント](./xxx.md)

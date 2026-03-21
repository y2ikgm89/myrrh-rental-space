# Prisma スキーマの破壊的クリーンアップ手順

未使用カラム・enum 値・deprecated フィールドを削除する際の **運用チェックリスト**。本番 DB では必ずバックアップとロールバック手順を用意する。

## 事前調査

1. `prisma/schema.prisma` の候補フィールドを列挙する。
2. **アプリコード**: `src/shared/domain` / `src/shared/db` / Server Actions で参照がゼロか `rg` で確認。
3. **データ**: 本番で非 NULL かつ利用中の行がないか SQL で確認（`COUNT(*)` / サンプリング）。
4. **外部連携**: レポート・BI・バックアップ復元スクリプトが直参照していないか確認。

## マイグレーション

1. `bunx --bun prisma migrate dev --name remove_<resource>_<field>`（開発）
2. ステージングで `prisma migrate deploy` → アプリ smoke
3. 本番: メンテナンスウィンドウまたは低トラフィック帯で `deploy`

## ロールバック

- 列削除は **前方のみ**の場合が多い。ロールバックはバックアップからのリストアまたは **新マイグレーションで列を再追加**（データは失われる前提）。

## 履歴の squashing

**本番に適用済みの `prisma/migrations` を書き換えない**（Prisma 公式の前提）。新規クローン用に履歴を畳みたい場合は別リポジトリ/テンプレートで検討し、稼働中 DB とは切り離す。

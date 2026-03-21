---
name: prisma-migration
description: >
  Prisma スキーマ変更後にマイグレーションを生成・実行する。
  schema.prisma の差分を確認し、マイグレーション名を提案、`migrate dev` を実行しクライアントを再生成する。
  prisma/schema.prisma を編集した直後に使用。
  引数ヒント: [migration-name]（省略可）
---

# Prisma Migration Skill

## Steps

1. **差分確認**: `git diff prisma/schema.prisma` でスキーマの変更内容を確認する

2. **マイグレーション名を提案**: 変更内容に基づいて `snake_case` の名前を提案する

   | 変更種別         | 命名規則                      | 例                                     |
   | ---------------- | ----------------------------- | -------------------------------------- |
   | フィールド追加   | `add_<field>_to_<model>`      | `add_phone_to_customers`               |
   | フィールド削除   | `remove_<field>_from_<model>` | `remove_legacy_note_from_reservations` |
   | 新しいモデル     | `create_<model>_table`        | `create_coupons_table`                 |
   | インデックス追加 | `add_index_<model>_<field>`   | `add_index_reservations_start_at`      |
   | カラム変更       | `change_<field>_in_<model>`   | `change_status_type_in_spaces`         |
   | Enum 追加        | `add_<enum>_enum`             | `add_coupon_type_enum`                 |

3. **ユーザーに確認**: 提案した名前を提示してユーザーの承認を得る

4. **リスク評価**: 変更内容に以下が含まれる場合は `db-migration-reviewer` エージェントでチェック:
   - カラム削除（`DROP COLUMN`）
   - 型変更・型の縮小
   - NOT NULL 制約の追加（DEFAULT なし）
   - テーブル/カラムのリネーム

   ```bash
   bunx --bun prisma migrate dev --name <confirmed-name> --create-only
   # 生成された migration.sql を db-migration-reviewer エージェントに渡してレビュー
   ```

   判定結果に応じて:
   - **SAFE**: そのままステップ 5 へ進む
   - **REVIEW NEEDED**: 内容をユーザーに報告して確認を得てから進む
   - **BREAKING**: ユーザーに報告し、データ移行手順を追加してから進む

   破壊的変更がない場合（フィールド追加・インデックス追加・Enum 追加のみ）はこのステップをスキップ。

5. **マイグレーション実行**:

   ```bash
   bunx --bun prisma migrate dev --name <confirmed-name>
   ```

6. **クライアント再生成**:

   ```bash
   bun run db:generate
   ```

7. **結果報告**: 作成されたマイグレーションファイルのパスと変更内容を表示する

## 注意事項

- `better-auth-schema.prisma` は Better Auth が管理するファイル。手動で編集しない
- `--create-only` で生成された SQL は `prisma/migrations/<timestamp>_<name>/migration.sql` に保存される
- マイグレーション失敗時は `bunx --bun prisma migrate reset` で開発DBをリセット可能（**本番では使用不可**）
- 公式ワークフロー: [Development and production](https://www.prisma.io/docs/orm/prisma-migrate/workflows/development-and-production) / [Baselining](https://www.prisma.io/docs/orm/prisma-migrate/workflows/baselining)。履歴の整理や空 DB への単一 baseline はプロジェクト方針に合わせ、**手作業で SQL をいじらず** Prisma の推奨手順（`migrate diff` 等）を優先する
- スキーマ変更後は **`bun run db:generate`** を忘れずに（型とクライアントを `schema.prisma` に一致させる）

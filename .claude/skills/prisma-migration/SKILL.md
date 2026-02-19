---
name: prisma-migration
description: >
  Generate and run a Prisma migration after schema changes. Analyzes what
  changed in schema.prisma, suggests a migration name, runs the migration,
  and regenerates the Prisma client. Use after editing prisma/schema.prisma.
argument-hint: "[migration-name]"
disable-model-invocation: true
---

# Prisma Migration Skill

## Steps

1. **差分確認**: `git diff prisma/schema.prisma` でスキーマの変更内容を確認する

2. **マイグレーション名を提案**: 変更内容に基づいて `snake_case` の名前を提案する

   | 変更種別 | 命名規則 | 例 |
   |---------|---------|-----|
   | フィールド追加 | `add_<field>_to_<model>` | `add_phone_to_customers` |
   | フィールド削除 | `remove_<field>_from_<model>` | `remove_legacy_note_from_reservations` |
   | 新しいモデル | `create_<model>_table` | `create_coupons_table` |
   | インデックス追加 | `add_index_<model>_<field>` | `add_index_reservations_start_at` |
   | カラム変更 | `change_<field>_in_<model>` | `change_status_type_in_spaces` |
   | Enum 追加 | `add_<enum>_enum` | `add_coupon_type_enum` |

3. **ユーザーに確認**: 提案した名前を提示してユーザーの承認を得る

4. **マイグレーション実行**:
   ```bash
   bunx --bun prisma migrate dev --name <confirmed-name>
   ```

5. **クライアント再生成**:
   ```bash
   bun run db:generate
   ```

6. **結果報告**: 作成されたマイグレーションファイルのパスと変更内容を表示する

## 注意事項

- `better-auth-schema.prisma` は Better Auth が管理するファイル。手動で編集しない
- 本番データに影響するカラム削除・型変更は `--create-only` で SQL を確認してから実行することを推奨:
  ```bash
  bunx --bun prisma migrate dev --name <name> --create-only
  # prisma/migrations/<timestamp>_<name>/migration.sql を確認
  bunx --bun prisma migrate dev  # 確認後に実行
  ```
- マイグレーション失敗時は `bunx --bun prisma migrate reset` で開発DBをリセット可能（**本番では使用不可**）

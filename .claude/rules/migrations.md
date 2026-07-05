---
paths: ["prisma/**"]
---

# Prisma schema・migration・seed

## 基本フロー

1. `prisma/schema.prisma` を変更 → `bun run db:generate`
2. `bun run db:migrate --name <name>` で migration 生成・適用
3. `bun scripts/lint-migrations.ts prisma/migrations/<dir>/migration.sql` で squawk lint
4. テスト DB へは `bun run test:db:migrate`

## 禁止・制約

- **既存の `prisma/migrations/*/migration.sql` は編集禁止**。pre-commit
  （`scripts/check-protected-files.sh`）が改変（diff-filter=M）をブロックする。
  修正は新規 migration の追加のみ
- `db:push` / `db:reset` / `migrate reset` / `db pull` はユーザーの明示依頼時のみ
- **`prisma db pull` は CHECK 制約・constraint trigger を黙って落とす**。
  `blocked_dates_scope_target_check` や `events_schedule_integrity_check` trigger 等の
  手書き不変条件は baseline `00000000000000_init` にのみ存在する
- モデル名とテーブル名は `@@map` で乖離している（AuditLog → audit_logs 等、
  Better Auth 系は単数形）。migration SQL を書く・検証する際は schema.prisma と突合する

## squawk（migration lint）

- 意図的な破壊変更は SQL 文の**直前 1 行**に `-- squawk-ignore <rule名>` を書いて通す
  （rule 名必須。複数列の DROP は ALTER TABLE 文を列ごとに分割して per-column で ignore）
- npm ラッパー squawk-cli は spawn 失敗時 exit 0 の偽陰性があるため使わない
  （`SQUAWK_BIN` で公式バイナリを指定可能）

## デプロイとの連動（重要）

migration に `DROP COLUMN` / `RENAME COLUMN` / `RENAME TO` / `DROP TABLE` / `DROP TYPE` が
含まれると、main への merge で deploy workflow が自動的に breaking migration mode に入り、
public/admin 両サービスを scaling=0 停止 + 310 秒 drain する（**計画ダウンタイム発生**）。
Cloud Run のローリング窓を保つには expand/contract 分割を優先する。

## seed（prisma/seed.ts）

- 3 モード: 既定 dev（冪等・IAP 用固定スタッフ + デモデータ + 全 feature ON）/
  `--reset`（破壊的再構築）/ `--production [email] [name]`（本番テンプレート）
- Prisma 7 は `migrate reset` 後に自動 seed しない（`db:reset` script が明示実行する）
- seed は feature module の全 key を explicit に設定する契約、および E2E fixture
  （`e2e/fixtures/test-data.ts`）と slug・ステータスで二重定義結合している。
  seed のデータ変更は対応 fixture/spec の同時更新が必須

---
name: prisma-migration
description: prisma/schema.prisma の変更から Prisma migration の生成 (prisma migrate dev)・squawk lint・実 DB 検証・デプロイ影響確認までの完全手順。DB schema 変更、モデル/列/enum の追加・削除・リネーム、index/CHECK 制約の変更、expand/contract 分割の判断、breaking migration による計画ダウンタイム確認、seed・E2E fixture 整合が必要なときに使う。migration SQL のセルフレビュー checklist と PostgreSQL 固有の落とし穴 (ALTER TYPE, jsonb) を含む。
---

# Prisma migration 完全手順

schema 変更 → migration 生成 → lint → 検証 → デプロイ影響確認の順に進める。

常設規約 (重複記載しない — 必ず先に参照):

- 禁止事項・squawk 配置・breaking デプロイ連動・seed 契約: rules の `migrations.md`
- Prisma/ドメイン層の配置境界 (`server-only`, `basePrisma` vs `prisma`): rules の `db-domain.md`
- 生成型の流通経路 (enums gateway・JSON helper): rules の `type-safety.md`
- 実 DB 統合テストの書き方 (SERIAL_DB_TESTS 登録等): rules の `testing-unit.md`

## 0. 事前判断

- `prisma/schema.prisma` に触れる変更は原則 migration 必須。`bun run db:push` は
  プロトタイピング専用、`db:reset` / `migrate reset` / `db pull` はユーザー明示依頼時のみ。
- **schema 変更を伴う作業の完了条件は「migration がローカル DB に適用済み」**。
  type-check / build / test が全緑でも schema と DB の drift は検出できない
  (テストは mock と生成型しか見ない)。
- 破壊的変更 (DROP / RENAME) を含むかを最初に見積もる → ステップ 5 の判断基準へ。

## 1. schema.prisma 編集 → クライアント生成

1. `prisma/schema.prisma` を編集する。注意点:
   - datasource ブロックに url は無い。`DATABASE_URL` は `prisma.config.ts` の
     `env("DATABASE_URL")` が供給する (Bun が `.env` / `.env.local` を自動ロード)。
   - テーブル名は `@@map` で全 41 モデルがマップ済み (snake_case 複数形が基本、
     Better Auth 系 user/account/session/verification と admin_notification は単数形)。
   - 部分 unique index は previewFeatures `partialIndexes` で表現できる
     (例: `locations` の `@@unique([sortOrder], map: ..., where: { isActive: true })`)。
2. `bun run db:generate` で client を再生成し、型エラーの波及を確認する。
3. 新 enum / モデル型を app 層 (`src/app/*`) に流す場合は
   `src/shared/lib/validations/enums/prisma-types.ts` (enums gateway) 経由にする。

## 2. migration 生成

ローカル dev DB が必要: `docker compose up -d db` (port 5432 / DB `myrrh_rental`)。

- **単純な additive 変更**: `bun run db:migrate --name <name>`
  (実体は `bunx --bun prisma migrate dev`。生成と適用を同時に行う)。
- **データ移行・rename・backfill を含む変更**:
  `bun run db:migrate --create-only --name <name>` で SQL だけ生成し、
  **適用前に** SQL を意図通りに編集 (Prisma は semantic rename を推論せず
  DROP+ADD を出力する) → `bun run db:migrate` で適用する。
- `migrate dev` は対話プロンプト (drift 検出時の reset 確認等) を出すことがある。
  非対話環境で刺さる場合は無理に流さず、ユーザーに対話実行を依頼する。

修正のルール:

- **一度適用した migration の SQL を書き換えると checksum drift になり、次回
  `migrate dev` が reset を要求する**。修正は新 timestamp の別ディレクトリで
  新規 migration として作り直す (古い未コミット dir は削除してよい)。
- コミット済み migration の編集は pre-commit (`scripts/check-protected-files.sh`) が
  ブロックする。新規追加 (git status A) のみ許可。

## 3. migration SQL セルフレビュー checklist

生成 / 編集した `migration.sql` を必ず読み、`migration-reviewer` subagent
(`.claude/agents/migration-reviewer.md`) のチェックリスト項目 4-6（@@map 整合・
baseline 手書き不変条件の保全・PostgreSQL enum/NOT NULL 化/jsonb 変換の落とし穴、
実例つき）を自己チェックする。§8 で同 subagent に正式レビューを依頼する前の
セルフチェックとして使う。

## 4. squawk lint

```
bun scripts/lint-migrations.ts prisma/migrations/<dir>/migration.sql
```

有効 rule・ignore コメントの配置ルールは `migration-reviewer` チェックリスト項目 1 を参照。

- ゲート自体の動作確認: `bun scripts/lint-migrations.ts --selftest`
  (`scripts/lint-migrations.fixtures/` の unsafe / safe / ignored で検証)。

## 5. breaking 判定と expand/contract の判断基準

自動 breaking デプロイモードの発動条件・挙動（`_BREAKING_MIGRATION_DEPLOY` /
scaling=0 停止 + 310 秒 drain）は rules の `migrations.md`（デプロイとの連動）を参照。

判断基準:

1. **ダウンタイム不可 (通常運用)** → expand/contract に分割する:
   - expand PR: 新列/新テーブル追加 + 新旧二重 write (+read は新→旧 fallback)。
     additive なので squawk も breaking grep も通る。
   - デプロイ完了後の contract PR: 旧参照コードを全除去 → 最後に DROP migration。
2. **ダウンタイム許容 (リリース前・アクティブユーザー無し等)** → big-bang 1 PR。
   自動ダウンタイムモードが安全弁になるが、**ユーザーの明示承認を得てから**行う。
3. どちらでも **DROP を含む PR の前提**: 旧列/テーブルへの参照が `origin/main` に
   残っていないことを Grep で全確認する。dead な設定でも明示 `select` に列名が
   残っていれば旧 revision が 500 を返す。ローカルが stale な可能性があるため
   `git fetch origin main` 後に `git show origin/main:<file>` で実体確認する。

## 6. テスト・検証

順に実行し、実出力で確認する:

1. `bun run test:db:migrate` — テスト DB へ `prisma migrate deploy`
   (TEST_DATABASE_URL 未設定なら docker compose `test-db`
   (localhost:5433 / `myrrh_test`) を自動起動)。**空 DB からの全 migration 再生**
   が通ることの確認を兼ねる。
2. 影響ドメインの統合テスト: `bun scripts/run-tests.ts __tests__/integration/<対象>`
   (CHECK 制約・トリガーに触れた場合は該当の実 DB テスト、例:
   `__tests__/integration/domain/blocked-dates/scope-check-constraint.test.ts`)。
3. `bun scripts/run-tests.ts __tests__/unit/architecture-boundaries.test.ts`
   — db script 文字列・Prisma 境界規約の固定検証。
4. `bun run validate` — type-check + lint (**テストは含まれない**ので 2-3 と併用)。
5. 完了報告前に、dev DB へ適用済みか `bun run db:migrate` が
   "already in sync" 相当で終わることを確認 (未適用ならユーザーに対話実行を依頼)。

## 7. seed / E2E fixture 整合

- 新モデル・新列は `prisma/seed.ts` への反映要否を判断する (3 モードの契約は
  rules の `migrations.md`)。
- feature module を追加した場合は `src/shared/lib/features/registry.ts` の
  `FEATURE_MODULES_LIST` に id を追加する。seed の `buildInitialFeatureModules` が
  全 key explicit で `Settings.featureModules` を初期化する契約
  (既存 install の toggle は re-seed で上書きしない create-only 経路)。
- seed のデモデータは `e2e/fixtures/test-data.ts` と slug・ステータスで
  二重定義結合している。seed データを変えたら対応 fixture / spec を同時更新する。
- 反映後は `bun run db:seed` を再実行し冪等に通ることを確認する。

## 8. レビューとコミット

1. merge 前に **migration-reviewer subagent** (`.claude/agents/migration-reviewer.md`)
   へ新規 migration ディレクトリ (または schema diff) を渡し、squawk / breaking 判定 /
   @@map 整合 / 手書き不変条件 / expand-contract 妥当性の所見を得る。
2. コミットは `prisma/schema.prisma` + 新規 migration ディレクトリ + 生成型に依存する
   コード変更を同一 commit にまとめる (migration だけ先行させない)。
3. main への merge は即本番デプロイ (breaking 検出時は自動ダウンタイム) であることを
   PR 説明に明記する。

---
paths:
  - "prisma/**"
  - "src/shared/db/**"
---

# Prisma / DB

migration を新しく作る手順は `/new-migration` skill にある。ここは常に効く制約だけ。

## schema と migration をずらさない

`schema.prisma` を変えたら必ず migration を作る。drift は type-check でも lint でも
build でも検出できず、次の `prisma migrate dev` が意図しない DDL（典型は手書きの
partial UNIQUE を DROP INDEX する）を混ぜ込む。捕まえるのは実 DB gate だけ。

強制: `__tests__/integration/prisma/schema-migration-drift.test.ts`。ローカルでは
`bun run test:integration`、CI では **required check の Unit Tests job**（`test:all` が
postgres service に対して `__tests__/integration` まで回す）。**pre-push では走らない**
ので、ローカルではずれたまま push できて CI で落ちる。

## migration ファイル

- **既存の migration SQL は編集しない。** pre-commit が改変（`diff-filter=M`）を
  拒否する。新規追加は許可されるので、直したいときは新しい migration を足す。
- 新規 migration の手編集は正規手順。`--create-only` で生成してから書き換える。
- `prisma/migrations/00000000000000_init/` は `scripts/build-baseline-migration.ts`
  の**生成物**。手で触らない。
- ディレクトリ名は `<14 桁 timestamp>_<snake_case>`。timestamp の重複は禁止。
- 14 桁の migration 名を、コードにも指示文書にもコメントにも書かない。
  畳んだ履歴の中で嘘になる。

## 接続先

Prisma CLI の接続先は `DIRECT_URL` が最優先、次に `DATABASE_URL`。`.env.local` に
本番の `DIRECT_URL` が残っていれば、`DATABASE_URL` がローカルでも本番に当たる。

`db:push` / `db:reset` / `db:migrate` の 3 つは
`scripts/assert-destructive-db-target.ts` が前段で接続先を検査し、本番に見えるなら
中止する（`migrate dev` も対象 — Prisma 公式が "intended for development with a
disposable database" と書き、drift 検出時に reset を促すため）。
強制: `__tests__/unit/architecture/destructive-db-guard.test.ts`

## seed

- Prisma 7 は `migrate reset` で seed を自動実行しない。ローカル再構築は
  `bun run db:reset`（reset のあと明示的に seed する）。
- `bun run db:seed` 単体は `APP_SURFACE` が set されていると安全ガードに拒否される。
  `bun run setup` はその step だけ `APP_SURFACE` を外している。
- seed の行を「あれば skip」で書かない。相対時刻や導出値を持つ行が古いまま固定され、
  新品 DB では絶対に再現しない壊れ方をする。

## 生成物

- Prisma client の生成先は `generated/prisma`（git 管理外）。
- `prisma/baseline/invariants.sql` は実 DB から生成する。列の型を変えると CHECK 式の
  綴りが変わるので、**再生成しないと古いまま残る**。
  強制: `__tests__/integration/prisma/invariants-are-regenerated.test.ts`

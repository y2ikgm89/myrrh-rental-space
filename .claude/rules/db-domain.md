---
paths:
  - "src/shared/db/**"
  - "src/shared/domain/**"
  - "prisma/schema.prisma"
  - "prisma/seed*.ts"
---

# DB / ドメイン層

Prisma 7 + `@prisma/adapter-pg` + PostgreSQL 18。client は `generated/prisma`
に生成される（git 管理外。`bun run db:generate`）。

## Prisma に触れてよい場所

`src/shared/db/**` と `src/shared/domain/**` だけ。`src/app/**` は
route handler・Server Action・cron route を含めて必ず `shared/domain` を経由する。

- barrel `@/shared/db` は db 層の外から import しない。利用側は
  `@/shared/db/prisma` を直接 import する（ESLint `no-restricted-imports`）。
- 公開アプリ層（`src/app/(public)/**`）は `@/shared/db` も
  `@/shared/db/prisma` も import 禁止。
- 依存の向きは `app → shared/domain → shared/lib`。`shared/lib → shared/domain`
  は凍結 allowlist で、新規追加は
  `__tests__/unit/architecture-boundaries.test.ts` が落とす。
- Prisma client に `$extends` を足さない。`$transaction` の戻り型が壊れて
  数百件の型エラーになる。

## トランザクション

**`prisma.$transaction([...])` の配列形式は禁止**（動的な `items.map(...)` も同じ）。
`adapter-pg` / `pg` 8.x の `client is already executing a query` を誘発する。

- 原子性が不要 → `Promise.all([...])`
- 原子性が必要 → `prisma.$transaction(async (tx) => { … })`（interactive 形式）

interactive transaction の中で `Promise.all` を使わない
（`__tests__/unit/architecture/prisma-interactive-tx-no-promise-all.test.ts`）。

**advisory lock と `SERIALIZABLE` を併用しない。** 直列化失敗でトランザクションが
巻き戻ると lock ごと消え、ロックとして機能しない。落ちるのも `P2002` ではなく
`P2034`。

## 予約の同時実行制御

在庫（時間帯の重複）は 2 段で守る。

1. `lockSpaceForTransaction(tx, spaceId)`（`space-locks.ts`）で space 単位の
   advisory lock を取り、同一 space への書き込みを直列化する。
2. DB 側の最終防衛線として EXCLUDE 制約
   `reservations_no_active_time_overlap_excl`
   （`space_id` = かつ `tstzrange(start_time, end_time, '[)')` && 、
   `deleted_at IS NULL AND status IN (PENDING, CONFIRMED)`）。

**可用性に影響する全書込経路がこの lock を通る。**新しい書込経路を足すときは
必ず同じ順序（lock → 読み → 書き）にする。read-only の rate plan 取得のように
lock 不要なものは lock の外（tx の前）で済ませる。

## 追記専用テーブル

監査ログ・利用規約同意・返金・問い合わせステータス履歴などは DB trigger
（`prevent_<table>_mutation`）で UPDATE / DELETE を禁止している。SSoT は
`prisma/baseline/invariants.sql` で、Prisma delegate 側の呼び出し制限は
`__tests__/unit/architecture-boundaries.test.ts` が trigger から自動で導出する。
可変列を増やすときは trigger と宣言の両方を更新する。

## 命名

- 列の物理名は snake_case（Prisma field は camelCase + `@map`）
- enum 型名は snake_case（`@@map`）、enum 値は UPPER_SNAKE
- テーブル物理名は snake_case。1 行しか持たない設定表は単数形、集合表は複数形

免除は無い（`__tests__/unit/architecture/prisma-naming-conventions.test.ts`）。

## 並び替え

一意な order index は 0 ↔ 1 の直接交換ができない。`src/shared/domain/order-sql.ts`
の `buildUuidOrderSqlFragments` で「一時値へ退避 → 最終 CASE」を同一トランザクション
で流す。cast 無しの変種を再導入しない（`::uuid` / `::int4` の明示 cast が
CASE 式の型推論を決定的にしている）。

## 論理削除

削除は基本 soft delete（`deleted_at`）。テスト後始末で物理削除しない。
soft-delete 述語つきの partial unique index は「その列で行を特定していない」
モデルにしか使えない（slug で引くモデルには使えない）。

## seed

`prisma/seed.ts` は「あれば skip」を書かない。相対時刻や導出値を持つ行で
skip すると、長生きした DB だけで値が腐る（新品 DB の CI では絶対に再現しない）。
判定キーは schema の一意制約と一致させること（ESLint
`local/seed-respects-unique-constraints` が強制）。ずれると再実行が P2002 で
中断し、以降の phase が丸ごと走らない。

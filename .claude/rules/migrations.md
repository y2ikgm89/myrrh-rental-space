---
paths:
  - "prisma/**"
  - "scripts/lint-migrations.ts"
  - "scripts/migration-preconditions.ts"
  - "scripts/db-census.ts"
  - ".squawk.toml"
---

# Prisma migration

対象 PostgreSQL は **18**（本番 Neon / `docker-compose.yml` / CI / `.squawk.toml`
`pg_version` の 4 箇所が揃っている必要がある）。`prisma/migrations/` は
baseline `00000000000000_init` に畳んである。DB の不変条件（CHECK / EXCLUDE /
関数 / trigger）は Prisma のスキーマ言語で表現できないため
`prisma/baseline/invariants.sql` が SSoT。

## 変えてはいけない前提

- **既存の migration SQL を編集しない。** `scripts/check-protected-files.sh` が
  pre-commit で変更（`diff-filter=M`）をブロックする。新規追加（`A`）は通る。
  直したいことがあれば必ず次の migration を足す。
- **migration の中で自動データ修復をしない。** 連絡先や会計の証跡を黙って
  切り詰める・埋めると、そのデータは二度と戻らない。落ちるのが正しい。
- **migration 名を他のファイルに書かない。** 履歴は baseline へ畳まれるので、
  名指しは畳んだ瞬間に嘘になる（`__tests__/unit/architecture/gates-do-not-pin-migrations.test.ts`）。
  免除が要るときはファイル名ではなく件数の ratchet にする。

## 書き方

```sh
bun run db:migrate --name <snake_case_name>
```

- ディレクトリ名は `<14 桁 timestamp>_<snake_case>`。同じ timestamp の重複は
  `__tests__/unit/architecture/migration-timestamp-monotonic.test.ts` が落とす。
- **2 文以上の migration は自分で `BEGIN;` / `COMMIT;` で包む。**
  Prisma は PostgreSQL の migration をトランザクションで包まない（公式仕様、
  実測でも失敗した `CREATE TABLE` が残った）。包まないと部分適用のまま
  `_prisma_migrations` に失敗が記録され、以降のデプロイが全部止まる。
  強制は `__tests__/unit/architecture/migration-atomicity.test.ts`。baseline だけが免除（空 DB に走るので
  既存行が無い）。
- `CREATE INDEX CONCURRENTLY` はトランザクション内で使えない。使うなら
  その文だけ別 migration に分ける。
- **ヘッダに「適用前に本番で流してください」の SELECT やコマンドを書かない。**
  人が読んで手で流す前提の検査は流されないまま「確認済み」と誤読される。
  強制は `__tests__/unit/architecture/migration-header-has-no-manual-precheck.test.ts`（件数 ratchet）。

## 適用前のリハーサル

```sh
bun scripts/migration-preconditions.ts            # .env.local の DB
bun scripts/migration-preconditions.ts --url postgresql://...
```

未適用の DDL を 1 トランザクションで実際に流して必ず巻き戻す。既存行に当たって
落ちるかどうかを PostgreSQL 自身に判定させる（静的分類は収束しないことが実測で
確定している）。同時に、DB の migration 履歴が repo と同じ系譜かも照合する
（`prisma migrate deploy` はここを見ないので、接続先が別 DB でも
`No pending migrations to apply.` を exit 0 で返す）。

リハーサルが証明するのは「この SQL がエラーにならない」ことだけ。**破壊は
エラーではない**（満杯のテーブルでも `DROP COLUMN` は成功する）。破壊の側は
squawk と計画ダウンタイムモードが見る。

## squawk（CI の migration-safety job）

`scripts/lint-migrations.ts` が変更された `prisma/migrations/**/migration.sql`
を squawk にかける。守っている事故は 1 つだけ — **Cloud Run のローリング切替窓
（migrate 完了〜新リビジョン ready）で旧コードが破壊済みの新スキーマを叩いて
500 になる**こと。ロック/型スタイル系のルールは単一インスタンス構成では過剰
なので `.squawk.toml` で外してある。

意図的に破壊的な migration を通すときは、SQL 先頭に
`-- squawk-ignore-file <rule>`（または該当文の直前に `-- squawk-ignore <rule>`）
を書く。パス allowlist は存在しない（入口が 2 つあると見えない方が使われる）。
書いた migration が本当に計画ダウンタイム付きでデプロイされることは
`__tests__/unit/architecture/migration-squawk-ignore-is-breaking.test.ts` が workflow の正規表現と突き合わせて
強制する。**散文で「安全だ」と主張しても通らない。**

```sh
bun scripts/lint-migrations.ts prisma/migrations/<dir>/migration.sql
bun scripts/lint-migrations.ts --selftest    # ゲート自体の検証
```

baseline だけが squawk の対象外。理由は「古いから」ではなく、空 DB に走るので
旧 revision も既存行も存在せず全ルールが構造的に非該当だから。**この免除を
2 本目以降に広げない。**

## 破壊的 migration = 計画ダウンタイム

本番デプロイ（`.github/workflows/deploy-production.yml` の手動 dispatch）は、
適用対象の SQL が下記のいずれかを含むと公開・管理の両サービスを scale 0 にして
310 秒 drain する。判定の SSoT は workflow 内の正規表現で、この列挙はそこから
導出した集合と一致することを `__tests__/unit/architecture/breaking-migration-detection.test.ts` が強制する。

<!-- breaking-triggers:start -->

ALTER TABLE ... ALTER COLUMN ... DROP DEFAULT /
ALTER TABLE ... ALTER COLUMN ... SET NOT NULL /
ALTER TABLE ... ALTER COLUMN ... TYPE /
ALTER TABLE ... DROP COLUMN /
ALTER TABLE ... DROP CONSTRAINT /
ALTER TABLE ... RENAME COLUMN /
ALTER TABLE ... RENAME TO /
ALTER TYPE ... RENAME TO /
ALTER TYPE ... RENAME VALUE /
DROP TABLE /
DROP TYPE

<!-- breaking-triggers:end -->

`ALTER INDEX ... RENAME TO`（Prisma が index の `map` 変更で出す）は**発動しない**。

## 列を狭めるとき

`text → varchar(n)` や `varchar(m) → varchar(n)` は既存値が n を超えると落ちる。
狭めるすべての列について、`<table>.<column>` と `> <新しい上限>` を同じコメント行に
書く形が `__tests__/unit/architecture/narrowing-migration-preflight.test.ts` の契約（一部の列だけ書いて
「確認済み」にするのを防ぐため）。上限そのものは Prisma schema と
`__tests__/unit/architecture/varchar-write-bounds.test.ts` / `__tests__/unit/architecture/string-column-declarations.test.ts` が見ている。

## スキーマの現況を見る

```sh
bun scripts/db-census.ts            # 列・制約・index・trigger の棚卸し
```

ローカル PG と本番 Neon で `NOT NULL` の件数がずれて見えることがある
（PG17 以降は `pg_constraint` にも載るため）。差がそこだけなら等価。

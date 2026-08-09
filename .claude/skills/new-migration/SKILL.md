---
name: new-migration
description: Prisma の schema を変えて migration を追加する手順。db:migrate と --create-only の使い分け、squawk と破壊的 DDL の扱い、本番リハーサルを止めてしまう SQL、VARCHAR を狭めるときの追加要件、invariants の再生成、検証コマンドまで。DB スキーマを触るとき・migration を足すときに使う。
---

# migration を追加する

`prisma/**` の常時制約は `.claude/rules/prisma-db.md` にある。ここは手順。

## 0. 接続先を確かめる

`bun run db:migrate` に破壊的操作ガードは**無い**。Prisma CLI は `DIRECT_URL` を
最優先で見るので、先に何を指しているか確認する。ローカル DB でなければ実行しない。

```bash
docker compose up -d db
```

## 1. schema を変える

`prisma/schema.prisma` を編集する。列を足すときの制約:

- `String` は `@db.VarChar(n)` か `@db.Text` を明示する（暗黙の text にしない）
- 数値列には CHECK 制約で定義域を与える
- ID は uuid に統一する

いずれも免除リストの無いゼロ強制なので、外すと必ず落ちる。

## 2. migration を生成する

```bash
bun run db:migrate --name <snake_case_name>
```

SQL を手で書く必要があるとき（既存データのある表に必須列を足す、部分 UNIQUE を
張る、CHECK を足す等）は生成だけ先にする:

```bash
bun run db:migrate --name <snake_case_name> -- --create-only
# prisma/migrations/<timestamp>_<name>/migration.sql を編集
bun run db:migrate            # 適用
```

**既に適用済みの migration は編集しない。** pre-commit が改変を拒否する。

## 3. SQL を書くときの制約

- 全体を `BEGIN;` … `COMMIT;` で包む。包まないと途中失敗で部分適用のまま止まる
  （Prisma は既定でトランザクションに包まない）。
- **本番前リハーサルを止める構文を書かない。** `CONCURRENTLY` / `VACUUM` /
  `SAVEPOINT` / `RELEASE` / `SET TRANSACTION` / 二相コミットが入ると、リハーサルは
  1 文も実行せずに停止する（1 トランザクションで流して巻き戻す前提のため）。
  外側の `BEGIN;` / `COMMIT;` だけは読み飛ばされる。
- **ヘッダに「適用前にこれを流して確認せよ」を書かない。** 具体的には、ヘッダ本文に
  `適用前…確認クエリ` を書く / コメント行の本文を `SELECT` で始める / 「適用前」と
  実行可能コマンドを同じ行に置く、の 3 つが落ちる。自動で走る仕組みへの参照
  （`-- リハーサル: bun scripts/migration-preconditions.ts` など）は通る。
- **VARCHAR を狭めるとき**は、どこかのコメント行に `<table>.<column>` と `> <n>` を
  **同じ行**で書く（例: `-- locations.email > 254`）。ヘッダの中に置いてよい。

## 4. 破壊的 DDL を含む場合

`DROP COLUMN` / `DROP CONSTRAINT` / `RENAME COLUMN` / `RENAME TO` /
`ALTER COLUMN … SET NOT NULL` / `… DROP DEFAULT` / `… TYPE` / `DROP TABLE` /
`DROP TYPE` / `ALTER TYPE … RENAME VALUE` を含むと、本番デプロイが自動的に
**計画ダウンタイムモード**（メンテナンス表示 → migrate → 新リビジョン）に切り替わる。

意図的にやるなら:

1. 旧コードからの参照がゼロであることを確かめる
2. SQL の先頭に `-- squawk-ignore-file <rule>` を置き、理由を隣に書く

`__tests__/unit/architecture/migration-squawk-ignore-is-breaking.test.ts` が、
その免除が本当に計画ダウンタイム対象かをデプロイ側の判定と突き合わせる。
**「安全だ」と散文で書くだけでは通らない。**

## 5. 生成物を追随させる

列の型や制約を変えたら `prisma/baseline/invariants.sql` の CHECK 式の綴りも変わる。
再生成しないと古いまま残り、`db-census` でも気づけない。

## 6. 検証

```bash
bun scripts/lint-migrations.ts prisma/migrations/<dir>/migration.sql  # squawk（要バイナリ）
bun run test:integration      # schema/migration drift と invariants の実 DB gate
bun run validate
```

`bun run test:integration` を通さずに終わらせない。schema と migration のずれは
type-check でも lint でも build でも出ず、次の `migrate dev` が意図しない DDL を
混ぜ込む形で表面化する。

## やってはいけないこと

- migration の中でデータ修復を走らせる（副作用の迂回路になるため禁止）
- 14 桁 timestamp で migration を名指しする（コードにもコメントにも文書にも）
- baseline (`00000000000000_init`) を手で編集する（生成物）

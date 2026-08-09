---
name: prisma-migration
description: Prisma のスキーマを変更して migration を追加する一連の手順。列やテーブルの追加・変更・削除、enum の変更、DB 制約 / trigger の追加、squawk ゲートへの対応、計画ダウンタイムの要否判断に使う。
---

# migration を追加する

方針の SSoT は `.claude/rules/migrations.md`。ここは**順番**を示す。

## 1. 変更の性質を先に決める

| 変更                                                                                                                                                        | 影響                                                      |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 列・テーブルの追加、index 追加、`NOT NULL` でない列                                                                                                         | 通常デプロイ                                              |
| `DROP COLUMN` / `DROP TABLE` / `DROP TYPE` / `RENAME` / `ALTER COLUMN … TYPE` / `SET NOT NULL` / `DROP DEFAULT` / `DROP CONSTRAINT` / `ALTER TYPE … RENAME` | **計画ダウンタイム**（両サービス scale 0 + 310 秒 drain） |

破壊的な変更を「無停止でやる」ことはできない。分割して安全な形
（新列追加 → 二重書き → 読み替え → 旧列削除）にするか、計画ダウンタイムを
受け入れるかを先に決める。

CHECK / EXCLUDE / plpgsql 関数 / trigger は Prisma のスキーマ言語で表現できない。
`prisma/baseline/invariants.sql` に相当するものを migration SQL に直接書く。

## 2. schema を編集する

`prisma/schema.prisma`。命名規約（列 snake_case + `@map`、enum 型 snake_case

- `@@map`、enum 値 UPPER_SNAKE、テーブルは集合=複数形 / 設定=単数形）は
  免除なしで強制される。

## 3. migration を生成する

```sh
bun run db:migrate --name <snake_case_name>
```

shadow DB の適用順は**ディレクトリ名の文字列順**。既存の最大 timestamp より
前の値を手で書かない。

## 4. 生成された SQL を整える

- **2 文以上なら先頭に `BEGIN;`、末尾に `COMMIT;` を足す。** Prisma は包まない。
- 意図した DDL だけが入っているか読む（Prisma が余計な rename を出すことがある）。
- **ヘッダに「適用前にこれを流してください」の SELECT やコマンドを書かない。**
- 列を狭めるなら、狭める**すべての**列について
  `-- SELECT '<table>.<column>' AS col, count(*) FROM <table> WHERE length(<column>) > <上限>`
  の形をコメントで残す。
- migration の中でデータを黙って修復・切り詰めしない。

## 5. ローカルで確かめる

```sh
bun scripts/lint-migrations.ts prisma/migrations/<dir>/migration.sql
bun scripts/migration-preconditions.ts
```

`lint-migrations` が破壊的変更を指摘したら、それは正しい。意図的なら SQL 先頭に
`-- squawk-ignore-file <rule>` を書く（そう書いた migration が本当に計画
ダウンタイムでデプロイされることをゲートが突き合わせる）。

`migration-preconditions` は未適用 DDL を実際に流して巻き戻す。
ここで落ちたら、そのまま本番でも落ちる。

## 6. テストとゲート

```sh
bun run test:db:migrate
bun run test:integration
bun scripts/run-tests.ts __tests__/unit/architecture
bun run validate
```

スキーマを触ると連動して落ちやすいゲート:

- `__tests__/unit/architecture/prisma-naming-conventions.test.ts`
- `__tests__/unit/architecture/db-enum-columns-are-not-string.test.ts`
- `__tests__/unit/architecture/string-column-declarations.test.ts` /
  `varchar-write-bounds.test.ts` / `numeric-column-domains.test.ts`
- `__tests__/unit/architecture/entity-reference-columns.test.ts` /
  `entity-id-format-binding.test.ts`
- `__tests__/unit/architecture/jsonb-column-shapes.test.ts`
- `__tests__/unit/architecture/temporal-order-constraints.test.ts`
- `__tests__/unit/architecture/migration-atomicity.test.ts` ほか migration 系

`prisma/seed.ts` の判定キーが一意制約とずれると ESLint が落とす。

## 7. デプロイ

`main` にマージしても本番には出ない。反映は Deploy Production の手動 dispatch。
破壊的なら計画ダウンタイムモードの step が出ることを build ログで確認する。
落ちたときは `.claude/skills/deploy-debug/`。

## やってはいけない復旧

失敗した migration の SQL を書き換えて再実行する（pre-commit がブロックする）。
`P3009` で詰まったら `prisma migrate resolve --rolled-back <name>` のうえで
**新しい** migration を足す。

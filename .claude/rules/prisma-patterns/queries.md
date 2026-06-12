---
description: Prisma クエリ・結果の扱い（select / include / list 型 / transaction / upsert race / seed split / Decimal 変換 / 禁止事項）
paths:
  - src/**/queries/**/*.ts
  - src/shared/domain/**/*.ts
  - prisma/seed.ts
---

# Prisma クエリ・結果の扱い

> select / include / list 専用型 / transaction の使い分け / upsert race / seed upsert split / Decimal 変換 / クエリ禁止事項。
> クライアント組立・初期化・環境（Better Auth 境界 / `$extends` / pg adapter / singleton）は → `prisma-patterns/client-setup.md`。

## user-mutable JSONB 列の seed upsert split パターン

Settings の JSONB 列で管理画面 UI を介してユーザーが編集する値（`featureModules` /
`sidebarWidgets` / `customApiKeys` 等）は、seed の `upsert` を split する:

- `create`（新規 install）: 初期値を含める
- `update`（re-seed）: **当該列を含めない**（user 編集を保持）

```typescript
// NG: re-seed で user toggle がリセットされる
await prisma.settings.upsert({
  where: { id: "singleton" },
  update: { ...settingsData, featureModules: defaultModules }, // user 編集を上書き
  create: { id: "singleton", ...settingsData, featureModules: defaultModules },
});

// OK: create only で初期化、update では user 編集を保持
await prisma.settings.upsert({
  where: { id: "singleton" },
  update: settingsData, // featureModules 除外
  create: {
    id: "singleton",
    ...settingsData,
    featureModules: resolveSeedFeatureModules(),
  },
});
```

検証: 任意の JSONB 値を手動で書き換えてから seed を再実行し、書き換え値が
残ることを `bun -e` で確認する。

参照実装: `prisma/seed.ts` `seedSettings()` の `featureModules` 配線。

## upsert の race condition（公式 Issue #3242）

Prisma の `upsert` は真のアトミック操作ではない（SELECT → INSERT/UPDATE）。同時リクエストで P2002 (Unique constraint failed) が発生する。**`findUnique` → 条件付き `update`/`create` + P2002 フォールバック** を推奨:

```typescript
// NG: upsert（レースコンディション）
const customer = await prisma.customer.upsert({
  where: { email },
  create: { email, name },
  update: { name },
});

// OK: find + create + P2002 フォールバック
const existing = await prisma.customer.findUnique({ where: { email } });
if (existing) {
  await prisma.customer.update({ where: { id: existing.id }, data: { name } });
  return existing.id;
}
try {
  const created = await prisma.customer.create({ data: { email, name } });
  return created.id;
} catch (e) {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
    const fallback = await prisma.customer.findUnique({ where: { email } });
    if (fallback) return fallback.id;
  }
  throw e;
}
```

参照実装: `src/shared/domain/reservations/resolve-customer.ts`、`src/shared/domain/customers/link.ts`

## Select 句で型を限定

```typescript
// OK: 必要なフィールドのみ取得
const post = await prisma.post.findUnique({
  where: { id },
  select: {
    id: true,
    title: true,
    contentHtml: true,
  },
});

// NG: 全フィールド取得（パフォーマンス低下・不要なデータ転送）
const post = await prisma.post.findUnique({ where: { id } });
```

## Include vs Select

```typescript
// OK: リレーションの一部フィールドのみ（推奨）
const post = await prisma.post.findUnique({
  where: { id },
  select: {
    id: true,
    title: true,
    author: {
      select: { name: true },
    },
  },
});
```

**⚠️ `include` と top-level `select` は同時使用不可**。`include: { _count }` や `include: { relation }` を含む findMany を explicit select に変換する場合、リレーションを `select` 内でネストする:

```typescript
// NG: include + select を同時使用（Prisma エラー）
prisma.postCategory.findMany({
  select: { id: true, name: true },
  include: { _count: { select: { posts: true } } }, // ← エラー
});

// OK: select 内でネスト
prisma.postCategory.findMany({
  select: {
    id: true,
    name: true,
    _count: { select: { posts: true } }, // ← ネストして解決
    author: { select: { id: true, name: true, email: true } },
  },
});
```

## List クエリ専用型（Omit パターン）

list クエリで重いフィールド（`contentHtml` / `contentJson` 等）を除外する場合、`Omit` で list 専用型を派生させる。
**select 変換後はコンポーネントの prop 型も更新が必要**（`bun run type-check` で洗い出せる）:

```typescript
// validations/post.ts — 重いフィールドを除いた list 専用型
export type PostListData = Omit<PostData, "contentHtml" | "contentJson">;

export type GetPostsResult = {
  posts: PostListData[]; // PostData[] から変更
  total: number;
  // ...
};

// PostTable.tsx — 受け取る prop 型も更新する
type PostTableProps = {
  posts: PostListData[]; // PostData[] → PostListData[]
};
```

## トランザクション

**`prisma.$transaction([...])` の配列形式は禁止**（ESLint `no-restricted-syntax` で error）。`@prisma/adapter-pg` + `pg` driver adapter 構成で、pinned PoolClient 上に `BEGIN → N queries → COMMIT` が積まれる瞬間があり、pg の `Calling client.query() when the client is already executing a query is deprecated and will be removed in pg@9.0` deprecation を誘発する（`_queryQueue.length > 0` 時に発火）。

```typescript
// NG: 配列形式 — pg deprecation を誘発
const [total, posts] = await prisma.$transaction([
  prisma.post.count({ where }),
  prisma.post.findMany({ where, select }),
]);

// OK: 原子性不要な独立クエリは Promise.all（ページネーション count + findMany 等）
const [total, posts] = await Promise.all([
  prisma.post.count({ where }),
  prisma.post.findMany({ where, select }),
]);

// OK: 原子性必須ならインタラクティブトランザクション（逐次 await で pg queue に積まれない）
await prisma.$transaction(async (tx) => {
  const post = await tx.post.create({ data: postData });
  await tx.postVersion.create({
    data: { postId: post.id, version: 1, contentHtml: post.contentHtml },
  });
  return post;
});
```

**判断基準**:

| 用途                                         | 選ぶもの                            | 理由                                       |
| -------------------------------------------- | ----------------------------------- | ------------------------------------------ |
| ページネーションの `count + findMany`        | `Promise.all`                       | 独立クエリ、原子性不要、並列で高速         |
| 集計の `count + sum + avg`                   | `Promise.all`                       | 同上                                       |
| `update + versionCreate` 等の履歴付き mutate | `$transaction(async (tx) => {...})` | 原子性必須、逐次 await で deprecation 回避 |
| 依存する複数 write（FK 制約あり）            | `$transaction(async (tx) => {...})` | 同上                                       |

**例外**: `prisma/seed.ts` の一括 `deleteMany` はデータ全削除の原子性が必須で、実行回数も限られるため配列形式を許容（ESLint 対象外パス）。

## Decimal 自動変換（$extends）

`createAppPrismaClient` の `$extends`（アプリ・seed で共通）により、対象モデルの Decimal が **結果として** `number` になる。
**手動で `Number()` を呼び出す必要はない**:

```typescript
// NG: 手動変換（不要）
const price = Number(space.pricePerHour);

// OK: $extends が自動変換済み
const price = space.pricePerHour; // number 型
```

**例外**: 集計結果（`_sum`, `_avg` 等）は `$extends` が効かないため、手動で `Number()` を使用:

```typescript
// 集計結果のみ手動変換が必要
const totalRevenue = await prisma.reservation.aggregate({
  _sum: { totalPrice: true },
});
const total = Number(totalRevenue._sum.totalPrice ?? 0);
```

### 対象モデルと型エクスポート

`prisma.ts` から `ConvertDecimalFields<T>` 適用済みの型をエクスポート済み:

```typescript
import type {
  Space,
  Reservation,
  Customer,
  Settings,
  Coupon,
} from "@/shared/db/prisma";

// これらの型は Decimal が number に変換済み
const space: Space = await prisma.space.findUniqueOrThrow({ where: { id } });
space.pricePerHour; // number（Decimal ではない）
```

## 禁止事項

1. **型アサーション禁止**
   - `value as string[]` → `parseStringArray(value)`（→ `prisma-patterns/json-fields.md`）
   - `value as DiscountType` → `isValidDiscountType(value)` または `getValidDiscountType(value)`（→ `prisma-patterns/enums.md`）

2. **raw クエリの乱用禁止**
   - Prisma Client で表現できるクエリは Client を使用
   - `prisma.$queryRaw` は Prisma で表現不可能な場合のみ

3. **N+1 クエリ禁止**
   - ループ内でクエリを発行しない
   - `include` / `select` でまとめて取得（→ §Include vs Select）

4. **手動 `Number()` 変換禁止（集計以外）**
   - `$extends` が自動変換済み。手動の `Number(space.pricePerHour)` は不要（→ §Decimal 自動変換）

5. **`prisma.$transaction([...])` 配列形式禁止**
   - ESLint `no-restricted-syntax` で error
   - 代替: `Promise.all([...])`（独立クエリ）または `prisma.$transaction(async (tx) => { ... })`（原子性必須）
   - 詳細: §トランザクション

6. **Prisma オブジェクトの直接 return 禁止（読み取り系 Actions）**
   - `return prismaObj` → NG（React 19 シリアライゼーションエラー）
   - `return prismaArray` → NG
   - `toPlainArray(prismaArray)` のみ（日付マッピングなし）→ NG（戻り値型に `date: string` がある場合、TypeScript 型エラー）
   - **OK**: `return toPlainObject({ ...obj, createdAt: obj.createdAt.toISOString(), updatedAt: obj.updatedAt.toISOString() })` — **`createdAt/updatedAt` だけでなく全ての `Date` フィールド**（`validFrom`, `validUntil`, `startTime`, `endTime`, `publishedAt` 等）も明示的に `.toISOString()` で変換すること。変換漏れがあると型は `Date` でも実態は `string` になりランタイムクラッシュする
   - **OK**: `return toPlainArray(array.map(item => ({ ...item, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() })))`

7. **`renderEditorStateToHtml` のトップレベル import 禁止**
   - `renderEditorStateToHtmlLazy()` を使用（ビルドエラー回避、→ `prisma-patterns/lexical-storage.md`）

8. **`'use cache'` 関数で `safeFetch()` を `await` なし・`toPlainObject()` なしで return 禁止**
   - `return safeFetch({...})` → `const result = await safeFetch({...}); return toPlainObject(result)`
   - Prisma モデルの narrow `select` でも Symbol プロパティは残る → `toPlainObject` 必須
   - 詳細と例 → `server-actions/implementation/forms-and-public.md` §公開データ取得パターン

## Gotchas

- **nullable JSON update は `Prisma.InputJsonValue`（`JsonValue` 禁止）** — `data: { field: content as Prisma.JsonValue }` は型エラー。**`as Prisma.InputJsonValue` cast も禁止** (2026-05-17 PR #109 で src/ 12 cast → 0 構造解消済、2026-05-18 PR #133 で `prisma/seed.ts` 10 cast も helper 化 → プロジェクト全体 0 達成)。代わりに `asPrismaInputJsonValue(value, msg)` (既パース済オブジェクト用) または `parsePrismaInputJson(json, msg)` (string→parse 用) を `@/shared/db/prisma-input-json` 経由で使用。両 helper は `isPrismaInputJsonValue` type guard + `DomainError("VALIDATION")` throw で runtime narrow する。検出 grep: `grep -rnE "as Prisma\.InputJson" src/ prisma/` で 0 件維持
- **状態遷移の atomic claim は `updateMany({ where: { status: { not: TARGET } } })` + `count` 判定** — Stripe webhook / 並行配信が起こりうる context で `findUnique → update` の 2 ステップ idempotency は race window が残り、後続副作用（メール / 監査ログ / cache invalidate）が二重実行される silent bug を生む。PostgreSQL 単一 UPDATE は atomic のため WHERE 条件で排他制御し `count > 0` を claim 成否として副作用を gate する。relation 込みデータが必要な場合は claim 成功後に `findUniqueOrThrow` で再取得。`claimReservationAsPaid` / `claimReservationAsFailed` / `claimReservationAsRefunded` (`@/shared/domain/reservations/payment-queries`) が canonical 参照実装、Stripe webhook (`/api/webhooks/stripe`) で利用
- **Prisma JSON フィールド（`Json @db.JsonB`）はランタイムで既にパース済みオブジェクト** — `post.contentJson` は `string` ではなく `JsonValue`（= ランタイム上は object / array / primitive）。JSON 文字列が必要な場合は `JSON.stringify(contentJson)`、走査する helper 関数は **`unknown` 受付 + 内部で `typeof === "string"` 分岐**により「既パース済み or 文字列」両対応にすると Prisma レイヤーの変更（`toPlainObject` 等）に強い。`@/shared/lib/lexical/extract-headings` が参照実装
- **日次集計 SQL は `AT TIME ZONE 'Asia/Tokyo'` + `TO_CHAR` で JST 化必須** — `DATE("createdAt")` は UTC 基準のため Cloud Run 環境で JST 日付境界が 1 日ずれる silent bug（22:00 JST = 13:00 UTC は同日扱いだが、08:00 JST = 23:00 前日 UTC は前日扱いになる）。`TO_CHAR("createdAt" AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD')` で JST 文字列を生成し `GROUP BY` する。窓境界の `oldestDate` も `new Date(\`${todayJstStr}T00:00:00+09:00\`)` で JST midnight 基準で計算（`getReservationChartData` 参照実装）

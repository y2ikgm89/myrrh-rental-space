---
description: Prisma クエリパターン（select / include / list 専用型 / transaction / upsert race / seed split）
paths:
  - src/**/queries/**/*.ts
  - src/shared/domain/**/*.ts
  - src/app/api/**
  - prisma/seed.ts
  - prisma/seed/**
---

# Prisma クエリパターン

> select / include / list 専用型 / transaction の使い分け / upsert race / seed upsert split。

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

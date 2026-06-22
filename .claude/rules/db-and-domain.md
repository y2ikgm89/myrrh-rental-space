---
paths:
  - "src/shared/db/**/*.ts"
  - "src/shared/domain/**/*.ts"
---

# DB / Prisma / ドメイン層の規約

## Prisma gateway（単一インスタンス）

- `new PrismaClient(...)` を書いてよいのは `src/shared/db/prisma.ts` のみ。他所での生成は禁止。
- 利用側は必ず `import { prisma } from "@/shared/db/prisma";`。barrel `@/shared/db` からの import は db 層の外では禁止。
- `prisma.ts` は2つを export する:
  - `basePrisma` … `$extends` 適用前の素の client。**better-auth 用**（拡張による型変換が認証と干渉するため素を渡す）。
  - `prisma` … `createAppPrismaClient(basePrisma)` でアプリ用拡張を適用したもの。アプリのクエリはこちらを使う。
- `@generated/prisma` の直 import は `shared/db/` `shared/domain/` `shared/lib/validations/enums/` の内側だけ。app 層に Prisma の model 型を流出させない。

## server-only

- DB に触れるファイル（query / command / admin-query）は **先頭行**で `import "server-only";`。
- 配置: `src/shared/domain/<entity>/queries.ts`（参照）/ `commands.ts`（更新）/ `admin-queries.ts`（管理用参照）。

## トランザクション

- ❌ `prisma.$transaction([q1, q2])` / `prisma.$transaction(items.map(...))` — 配列形式は `adapter-pg` / pg 8.x の "client is already executing a query" deprecation を誘発する（ESLint error）。
- ✅ 原子性が不要な並列は `Promise.all([...])`。必要なら interactive transaction `prisma.$transaction(async (tx) => { ... })`。

## JSON フィールド

- `as Prisma.InputJsonValue` の直書きは禁止。`@/shared/db/prisma-input-json` の helper（`asPrismaInputJsonValue` 等）を経由する。

## cache 無効化

- タグ文字列の直書き禁止。`CACHE_TAGS` / `getCacheTag` / `CACHE_LIFE`（`src/shared/lib/constants/cache.ts`）を使う。

## `'use cache'` + `safeFetch` を呼ぶときの境界（build-time prerender 汚染回避）

- `'use cache'` 関数が内部で `safeFetch({fallback: ...})` を使う場合、その関数を **layout 本体 / `generateMetadata` / `generateViewport` の直配置から呼ばない**。`next build` 時に `'use cache'` は eager 評価され、Dockerfile builder の placeholder `DATABASE_URL` で Prisma 接続失敗 → fallback の `null`/`[]` が静的シェル RSC payload に**永続 baking** され Cloudflare HIT で恒久汚染される（観測: PR #76c2316b 真因）。
- canonical pattern: **`<Suspense>` 境界内で `await connection()` を呼ぶ async server component** から呼び出す。これで build prerender は skip され runtime resume で実 DB から resolve。
  ```tsx
  async function Chrome(): Promise<ReactElement> {
    await connection();
    const data = await getSomeSettings(); // 'use cache' + safeFetch を使う query
    return <Renderer {...data} />;
  }
  <Suspense fallback={<Skeleton />}>
    <Chrome />
  </Suspense>;
  ```
- 例外的に許容されるのは `generateMetadata` の `favicon` / `generateViewport` の `themeColor` 程度（fallback が file-convention `favicon.ico` / `#fafafa` に収束し visible 影響皆無）。**layout body の `<main>` chrome に効くもの (header/tax/container 等) は必ず Suspense + connection() に隔離する**。
- 詳細根拠と再 litigate 禁止項目は memory [[project_cacheable-fetch-build-prerender-canonical-2026-06-22]] が SSoT。

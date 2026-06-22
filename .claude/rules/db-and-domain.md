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

- `'use cache'` 関数が内部で `safeFetch({fallback: ...})` を使う場合、その関数を **layout 本体 / `generateMetadata` / `manifest.ts` 等の static route の直配置から呼ばない**。`next build` 時に `'use cache'` は eager 評価され、Dockerfile builder の placeholder `DATABASE_URL` で Prisma 接続失敗 → fallback の `null`/`[]` が静的シェル RSC payload に**永続 baking** され Cloudflare HIT で恒久汚染される（観測: PR #76c2316b 真因）。
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
- **`generateViewport` の例外規約**: DB query を呼ぶときは必ず冒頭で `await connection()` を呼び、root layout の `<html>` を `<Suspense>` でラップして route 全体を `ƒ`（完全動的）化する（Next.js 16 公式 `next-prerender-dynamic-viewport` opt-in pattern）。この組合せが満たされている場合のみ generateViewport から `'use cache' + safeFetch` query を呼んでよい。これにより同時に **`generateMetadata` も runtime 評価**され、`getFaviconUrl` のような fallback null query も build prerender で baking されない。公開・管理画面どちらの root layout もこのパターンが適用済（admin: PR #604 / 公開: PR #76c2316b 系列 + nonce 修正 PR）。**connection() なしで generateViewport / generateMetadata から DB query を呼ぶのは禁止**。
- `manifest.ts` 等の static (`○`) route は generateViewport の opt-in が効かない（独立 route）。DB query を呼ぶと build prerender 汚染が確実に発生するため、**静的値で固定するか、route を `await connection()` で `ƒ` 化する**。後者は PWA install 等の低頻度 route では DB hit が無駄なため、原則は静的化推奨。
- layout body / `<main>` chrome に効くもの (header/tax/container/maintenance 等) は必ず Suspense + connection() の async SC に隔離する。
- 詳細根拠と再 litigate 禁止項目は memory [[project_cacheable-fetch-build-prerender-canonical-2026-06-22]] が SSoT。CSP nonce 文脈は [[project_admin-auth-csp-nonce-connection-2026-06-16]]。

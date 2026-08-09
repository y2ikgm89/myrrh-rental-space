---
paths:
  - "src/app/**"
  - "src/proxy.ts"
  - "src/instrumentation.ts"
  - "next.config.ts"
---

# App Router の構成

Next.js 16 App Router。`cacheComponents: true`（PPR + `"use cache"`）、
React Compiler、`typedRoutes: true`。`tailwind.config` は無い（Tailwind v4 の
CSS-first）。

## 2 つの Root Layout

`src/app/(public)/layout.tsx` と `src/app/(admin)/layout.tsx` がそれぞれ
`<html>` を持つ Multiple Root Layouts。公開 ↔ 管理の遷移はフルページリロード
（仕様）。どちらのサーフェスを配信するかは `APP_SURFACE` が決め、`src/proxy.ts`
が公開サーフェスで `/admin` `/preview` `/api/admin` `/api/health` 等をブロックする。

**`(admin)` と `(public)` の間で import しない。** `@/admin/*` と `@/public/*` の
相互 import は `__tests__/unit/architecture/cross-surface-import-gate.test.ts`
が落とす。共有したいものは `src/shared/**` に置く。

パスエイリアス:

| alias          | 実体                                          |
| -------------- | --------------------------------------------- |
| `@/shared/*`   | `src/shared/*`                                |
| `@/admin/*`    | `src/app/(admin)/admin/(dashboard)/_shared/*` |
| `@/public/*`   | `src/app/(public)/_shared/*`                  |
| `@generated/*` | `generated/*`（Prisma client、git 管理外）    |

## `src/proxy.ts`

共通セキュリティヘッダーと infra レベルのレート制限だけを持つ。ルーティングの
解決は route 側でやる。**DB を触るモジュールを import しない**
（`__tests__/unit/architecture-boundaries.test.ts`）。

## cacheComponents + strict-dynamic CSP

CSP は `script-src 'self' 'nonce-…' 'strict-dynamic'`。CSP3 では
`'strict-dynamic'` があると `'self'` が無視されるため、**nonce の付かない
`<script>` を含む静的 HTML を配信すると本番でその JS が全ブロックされる**。
nonce は request ヘッダーから取るので、prerender された HTML には付けられない。

不変条件は「route が動的か」ではなく **static prelude が空であること**。
検査は `bun scripts/check-static-prelude-empty.ts` がビルド成果物を直接見る
（`bun run build` に同梱済み）。route 表の `ƒ / ◐ / ○` を目視しても区別できない。

- `'use client'` なファイルから Zod のような重いモジュールを **value import**
  しない（prelude に載って nonce gap を作る）。barrel から schema 値を
  re-export しないのも同じ理由。
- `cacheComponents` 有効下では route segment config（`export const dynamic` 等）
  を残さない。

## App Router の特殊ファイル

- `_shared` 配下に `page.tsx` / `layout.tsx` のような特殊ファイル名を置かない。
- 公開側の route-level `loading` / `error` / `not-found` は layout の `main`
  landmark を重複させない（a11y ツリーが壊れる）。
- 管理ページは Suspense より**前**に認証する
  （`__tests__/unit/architecture/admin-page-auth-before-suspense.test.ts`）。
- route handler は `{ success: boolean }` 形式の legacy wrapper を返さない。
  `request.json()` の parse error を `catch(null)` で握りつぶさない。

## `next.config.ts`

- `Cache-Control` の catch-all を先頭に置き、認証系 / PII を含む route を
  後勝ちで `no-store` にする（順序が本体）。
- `Cache-Tag` ヘッダーの値は `src/shared/lib/constants/cdn-cache-tags.ts` の
  `CDN_CACHE_TAGS` から `joinCacheTags()` で作る。リテラル直書きは lint エラー。
- `typedRoutes` と TypeScript build error の無視禁止はゲートで固定されている。

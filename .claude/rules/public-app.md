---
paths:
  - "src/app/(public)/**/*.ts"
  - "src/app/(public)/**/*.tsx"
---

# 公開サイト `(public)` の規約

## DB アクセス境界

- `(public)` 配下から `@/shared/db` / `@/shared/db/prisma` / `@/shared/lib/prisma` を import しない（ESLint error）。
- データ取得は必ず `@/shared/domain/<entity>/queries`（server-only）経由。

## ページ構成

- 公開ページは Page + Section + SectionRenderer の構成。`getPageSectionsWithFallback(slug)` でセクションを取得し `SectionRenderer` で描画する。
- ページごとに追加できるセクション type は `src/shared/lib/sections/page-templates.ts` の template（`allowedSectionTypes` / `requiredSectionTypes`）が SSoT。`AddSectionDialog` はそれでフィルタする。
- 新しいセクション type を足すときは `adding-a-section-type` skill を参照。

## レンダリング

- 原則 Server Component。データ取得は上記 domain 経由で行い、Client には必要な props だけ渡す。

## Client bundle と Zod (CSP nonce gap 予防)

`(public)` の `'use client'` ファイルは下記 Zod-heavy module を **value-import 禁止** (`import type` のみ可・`__tests__/unit/architecture-boundaries.test.ts` の deny-list grep gate で 0 件強制):

- `@/shared/lib/portable-text/schema` (Zod span/block schema factory)
- `@/shared/lib/sections/definitions/<type>/schema` (section 設定 schema・例: `page-hero/schema`)
- `@/shared/lib/sections/{registry,field-registry}` (Zod レジストリ)
- `@/shared/lib/validations/{section,section-defaults}` (Zod schema 集約)

背景: `(public)` の一部ページは `◐` (static shell) で prerender される。public client が barrel 経由で zod chunk を引き込むと、生成 HTML に焼かれる `/_next/static/chunks/app-client-*.js` が per-request nonce 抜きで配信され strict-dynamic CSP 配下で全 evaluation block される (React Flight client-reference serializer が nonce 注入 API を持たない・facebook/react#29978 / vercel/next.js#55590 上流未修正)。canonical fix は (a) schema 値を `./schema` deep path に隔離、(b) public client は型のみ取得、(c) `static literal + 固定 _key` パターンで PPR (cacheComponents) + `crypto.randomUUID()` 衝突を回避 (`src/app/(public)/login/_components/login-hero.tsx` 参照)。

## Admin layout の動的化 (CSP nonce gap 予防の load-bearing 構造)

`src/app/(admin)/layout.tsx` の `generateViewport()` + `await connection()` + `<Suspense><html>` opt-in (Next.js 公式 next-prerender-dynamic-viewport) は admin 全 71 route を `ƒ` (完全動的) に強制する load-bearing 構造。**撤去 / 弱体化 / route segment config (`export const dynamic = ...`) での上書きは禁止**。撤去すると admin client (Conform `parseWithZod` 即時 validation / Lexical editor / portable-text 編集) が一斉に CSP block される (PR #604 で実証・admin が `ƒ` の間は admin から zod を value-import しても runtime nonce で全 chunk 保護される)。同型構造は `src/app/(public)/layout.tsx` にも実装済 (PR #696)。検証: `bun run build` 後に `.next/server/app/admin/**/*.html` が全て 0 バイト (= ƒ marker) であること。

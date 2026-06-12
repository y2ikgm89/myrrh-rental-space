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

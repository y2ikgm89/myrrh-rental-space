---
paths:
  - "src/shared/lib/sections/**/*.ts"
  - "src/shared/domain/sections/**/*.ts"
  - "src/app/(public)/_shared/components/sections/**/*.tsx"
---

# セクションシステムの規約

- 全セクション type 定義の SSoT は `src/shared/lib/sections/registry.ts`。DB に保存する前に `validateSectionConfig(type, config)`（`registry.ts`）で必ず検証する。section config は runtime の discriminated union なので、検証を飛ばすと描画時に silent break する。
- `src/shared/lib/sections/page-templates.ts`: `allowedSectionTypes` がページごとに追加可能な type を制限し、`requiredSectionTypes` は削除不可の core を定義する。許可しないページに足さない（二重配置などの UX バグを構造的に防ぐ意図）。
- config の Zod スキーマと型は `src/shared/lib/sections/` に集約。PortableText 化済みフィールドは `string` を受け付けない点に注意。
- セクション type を追加する手順は `adding-a-section-type` skill を参照。
- **Section 定義 barrel (`definitions/<type>/index.ts`) は Zod 値 (`*Schema` / factory) を re-export しない** — schema 値は `definitions/<type>/schema.ts` から deep-import する。public `'use client'` が barrel 経由で zod chunk を引き込むと `◐` static shell ページで CSP nonce 注入経路を外れ全 client chunk が strict-dynamic CSP で block される (PR #696 / #815 / portable-text と page-hero 同型 fix)。barrel は型と pure const (`HERO_TRANSITIONS` 等) のみ公開可。強制は `__tests__/unit/architecture-boundaries.test.ts` の deny-list grep gate。

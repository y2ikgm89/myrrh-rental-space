---
description: "@theme デザイントークン（breakpoint / spacing / hero / typography 等）の SSoT サマリ"
paths:
  - "src/**/*.css"
  - "src/app/(public)/**"
  - "src/app/(admin)/**"
---

# SSOT — @theme デザイントークン

レスポンシブ @theme tokens は `(public)/_styles/public.css` / `(admin)/_styles/admin.css` の `@theme` ブロックが SSoT。
詳細 token 一覧と利用ガイドは `frontend/project-design-config.md` §レスポンシブ設計 を参照。

主要 token 群:

- Breakpoint: `--breakpoint-3xl: 120rem`
- Header: `--header-height`（mobile-md 分岐）/ `--hero-header-offset`（hero 被り補正 = transparent: header-height / solid: 0px、`#main-content` で設定。hero pt は `--header-height` 直書き禁止 → `design-config/responsive.md`）
- Hero/Modal/Lightbox/Dropdown: `--hero-min-height` / `--modal-max-height` / `--lightbox-max-{height,width}` / `--dropdown-min-width`
- Prose/Container: `--prose-{narrow,medium}` / `--container-{measure,header-max,max,padding}` / `--container-editorial`
- Touch target: `--touch-target-min`
- Fluid typography: `--text-*`
- **セクション縦余白（公開・管理の SectionWrapper）**: `--space-3xs` … `--space-2xl` を `pt/pb-[var(--space-{sm,md,lg,xl})]` で参照。旧 `--spacing-section` / `--spacing-section-compact` は **廃止**（`architecture-boundaries.test.ts` で検出）
- **ブロック・カード用（レイアウトブロック）**: public `--spacing-block` / admin `--spacing-card`

**新規 arbitrary 値（`[65ch]` / `[85vh]` / `[90svh]` / `[12rem]` 等）を追加する前に既存 token を grep し、不足なら `@theme` に追加してから `min-h-[var(--hero-min-height)]` 等の CSS var 参照形式で利用する。**

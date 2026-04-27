---
paths:
  - src/**/*.tsx
  - src/**/*.ts
  - src/**/*.css
---

# Tailwind 4 パターン

> **Barrel-index:** 各 subtopic は path-scoped autoload で連鎖ロードされる。

- [テーマトークン・セマンティックカラー](tailwind-patterns/theme-tokens.md) — CSS アーキテクチャ / @theme / OKLCH / セマンティックカラートークン / @layer / Border Radius / 禁止事項
- [レスポンシブ breakpoints](tailwind-patterns/responsive-breakpoints.md) — breakpoint policy / マクロ vs マイクロレイアウト / 禁止事項
- [Container Queries](tailwind-patterns/container-queries.md) — @container / named container / CARD_GRID_COLS_MAP / 禁止・OK パターン
- [インラインスタイル vs arbitrary properties](tailwind-patterns/inline-style-vs-arbitrary.md) — specificity 衝突 / className 改行禁止 / JS 変数埋め込み禁止
- [Grid cell overlap](tailwind-patterns/grid-overlap.md) — responsive overlay pattern / Pair Grid 動的カラム / justify-self

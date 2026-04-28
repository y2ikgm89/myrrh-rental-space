---
description: Accessibility パターン — WCAG 2.2 AA / 2.5.5 Enhanced (AAA) 準拠（詳細は sub-file 参照）
---

# Accessibility パターン（barrel index）

> WCAG 2.2 AA + 2.5.5 Enhanced (AAA) 準拠 / React 19 / GSAP prefers-reduced-motion 対応
>
> **注**: このファイルは TOC のみ。実体は sub-file が `paths:` で auto-load する。手動参照用。

- [accessibility/semantics.md](./accessibility/semantics.md) — セマンティック HTML / aria-\* 属性
- [accessibility/focus-keyboard.md](./accessibility/focus-keyboard.md) — フォーカス管理 / キーボードナビゲーション
- [accessibility/touch-text.md](./accessibility/touch-text.md) — タッチターゲット 44px / フォントサイズ最小値 / Uppercase tracking
- [accessibility/motion.md](./accessibility/motion.md) — prefers-reduced-motion (GSAP matchMedia)
- [accessibility/images-text.md](./accessibility/images-text.md) — 画像 alt / 画像上テキスト 3 層可読性保証
- [accessibility/forms-prohibitions.md](./accessibility/forms-prohibitions.md) — フォーム a11y / 禁止事項 / 参照

本プロジェクトの a11y インフラ:

- `SkipLink` — キーボードナビゲーション（`@/public/components/a11y`）
- `AriaLiveRegion` — 動的コンテンツ通知（`@/public/components/a11y`）
- `AriaLiveProvider` — コンテキスト管理（`@/shared/contexts`）

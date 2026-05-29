---
description: Accessibility — prefers-reduced-motion (GSAP matchMedia パターン A/B/C)
paths:
  - "src/app/(public*)/**/*.tsx"
  - "src/app/(public*)/_shared/components/animations/**"
  - "src/public/hooks/use-motion-preference.ts"
---

# Accessibility — prefers-reduced-motion

全アニメーションは `prefers-reduced-motion` を尊重する（WCAG 2.3.3 / 公開サイト必須）。GSAP は必ず `gsap.matchMedia()` でラップし、reduce 時は不介入（要素は CSS デフォルトで表示）にする。`mm` を使わず直接 `gsap.from(...)` / `gsap.to(...)` するのは NG。

## 実装パターンの SSoT

GSAP matchMedia の具体実装（コード・選択ガイド）は `frontend/gsap/matchmedia/` が SSoT。本ファイルは accessibility 要件の宣言に留める:

- **パターン A**（reduce 時スキップ A-1 / conditions 分岐 A-2）+ **パターン B**（レスポンシブ breakpoint）→ [`../gsap/matchmedia/reduced-motion-and-bp.md`](../gsap/matchmedia/reduced-motion-and-bp.md)
- **パターン C**（イベント / タイマー駆動、`useMotionPreference` ReactiveRef、`useCallback` 禁止）+ **パターン D**（リスト stagger `ScrollRevealGroup`）→ [`../gsap/matchmedia/events-and-stagger.md`](../gsap/matchmedia/events-and-stagger.md)

## ScrollReveal（パターン A 実装済みコンポーネント）

`ScrollReveal` / `ScrollRevealGroup` は `gsap.matchMedia` 対応済みのため、追加対応なしで直接使用できる:

```tsx
// OK: ScrollReveal は reduced-motion を自動でスキップ
<ScrollReveal delay={0.2}>
  <p>このテキストはスクロールで出現</p>
</ScrollReveal>
```

---
description: GSAP matchMedia パターン（prefers-reduced-motion・ブレークポイント・イベントハンドラ・リスト stagger）
paths:
  - "src/app/(public*)/_shared/lib/gsap*"
  - "src/app/(public*)/_shared/lib/animations*"
  - "src/app/(public*)/_shared/components/providers/lenis-provider*"
  - "src/app/(public*)/_shared/lib/a11y/motion*"
  - "src/app/(public*)/_components/**/*.tsx"
  - "src/app/(public*)/_shared/components/animations/**"
---

# GSAP matchMedia パターン

> GSAP 3.14.2 / @gsap/react 2.1.2 対応

> 詳細サブルール（path-scoped auto-load）:
>
> - **パターン A: prefers-reduced-motion + パターン B: レスポンシブブレークポイント (`useGSAP` + `mm.add` 自動 revert)** — `frontend/gsap/matchmedia/reduced-motion-and-bp.md`
> - **パターン C: イベントハンドラ + タイマー駆動 (useCallback 禁止 / motionOk ref) + パターン D: リスト stagger (ScrollRevealGroup)** — `frontend/gsap/matchmedia/events-and-stagger.md`

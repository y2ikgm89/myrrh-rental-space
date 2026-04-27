---
description: GSAP 3.14.2 アニメーションパターン — 詳細は sub-file を参照
paths:
  - "src/app/(public*)/_shared/lib/gsap*"
  - "src/app/(public*)/_shared/lib/animations*"
  - "src/app/(public*)/_shared/components/providers/lenis-provider*"
  - "src/app/(public*)/_shared/lib/a11y/motion*"
  - "src/app/(public*)/_components/**/*.tsx"
  - "src/app/(public*)/_shared/components/animations/**"
---

# GSAP パターン（barrel index）

このファイルは barrel index。各トピックは以下 sub-file で管理:

- [gsap/core.md](./gsap/core.md) — 基本ルール・アニメーション定数・レスポンシブ規約・禁止事項・ファイル配置・Gotchas
- [gsap/matchmedia.md](./gsap/matchmedia.md) — パターン A matchMedia + prefers-reduced-motion・パターン B matchMedia + breakpoint・パターン C イベントハンドラ・パターン D リスト stagger
- [gsap/scroll-trigger.md](./gsap/scroll-trigger.md) — ScrollTrigger パターン（入場・スクラブパララックス・ピン固定）
- [gsap/lenis.md](./gsap/lenis.md) — Lenis スムーススクロール・Tailwind CSS 4 と GSAP の transform 共存

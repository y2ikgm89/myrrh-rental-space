---
description: GSAP matchMedia パターン A (prefers-reduced-motion) + B (レスポンシブブレークポイント) — useGSAP 内の自動 revert 機構
paths:
  - "src/app/(public*)/_shared/lib/gsap*"
  - "src/app/(public*)/_shared/lib/animations*"
  - "src/app/(public*)/_components/**/*.tsx"
  - "src/app/(public*)/_shared/components/animations/**"
---

# GSAP matchMedia パターン A + B

> 公式 Accessibility ガイド準拠の prefers-reduced-motion + レスポンシブブレークポイント分岐パターン。`useGSAP` + `mm.add` の自動 revert 機構で OS 設定 / 画面幅変更にリアルタイム対応。

## パターン A: matchMedia + prefers-reduced-motion（標準 — 全アニメーションで必須）

[GSAP 公式 Accessibility ガイド](https://gsap.com/resources/a11y) 推奨パターン。
`mm.add()` 内で作成された tween / ScrollTrigger は条件不一致時に自動 **revert**（inline style 除去）される。
OS 設定の動的切替にもリアルタイム対応。

**`prefersReducedMotion()` 関数は非推奨**。スナップショットのため OS 設定変更後にページリロードが必要。
`gsap.matchMedia()` はリアルタイム監視で自動 revert / 再構築する。

### パターン A-1: reduced-motion 時は完全スキップ（最も一般的）

GSAP 不介入 → 要素は CSS デフォルト（visible）のまま表示される。

```typescript
'use client'

import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import { gsap } from '@/public/lib/gsap-config'
import { DURATION, EASE, SCROLL_TRIGGER } from '@/public/lib/animations'

function MyComponent() {
  const containerRef = useRef<HTMLDivElement>(null)

  useGSAP(
    () => {
      const container = containerRef.current
      if (!container) return

      const mm = gsap.matchMedia()
      mm.add('(prefers-reduced-motion: no-preference)', () => {
        gsap.fromTo(
          container,
          { opacity: 0, y: 40 },
          {
            opacity: 1,
            y: 0,
            duration: DURATION.slow,
            ease: EASE.outQuart,
            scrollTrigger: {
              trigger: container,
              ...SCROLL_TRIGGER.reveal,
            },
          },
        )
      })
    },
    { scope: containerRef },
  )

  return <div ref={containerRef}>{/* ... */}</div>
}
```

### パターン A-2: conditions 分岐（reduced-motion でも軽量アニメーション実行）

reduced-motion 時はパラメータを控えめにする場合:

```typescript
useGSAP(
  () => {
    const mm = gsap.matchMedia();
    mm.add(
      {
        reduce: "(prefers-reduced-motion: reduce)",
        noPreference: "(prefers-reduced-motion: no-preference)",
      },
      (ctx) => {
        const { reduce } = ctx.conditions ?? {};
        gsap.to(el, {
          y: reduce ? 4 : 20,
          repeat: -1,
          yoyo: true,
          duration: reduce ? 2 : 1,
        });
      },
    );
  },
  { scope: ref },
);
```

### パターン A 選択ガイド

| 状況                                            | パターン |
| ----------------------------------------------- | -------- |
| reduced-motion 時はアニメーション完全省略       | A-1      |
| reduced-motion 時は控えめなアニメーションで代替 | A-2      |

## パターン B: matchMedia + レスポンシブブレークポイント

デスクトップ / モバイルで異なるアニメーションパラメータを分岐させる場合。
**ブレークポイントは `800px`**（Tailwind の `md: 768px` とは異なる）。

```typescript
useGSAP(
  () => {
    const mm = gsap.matchMedia();
    mm.add(
      {
        isDesktop: "(min-width: 800px)",
        isMobile: "(max-width: 799px)",
        noPreference: "(prefers-reduced-motion: no-preference)",
      },
      (ctx) => {
        const { isDesktop, noPreference } = ctx.conditions ?? {};
        if (!noPreference) return; // reduced-motion は必ずガード

        if (isDesktop) {
          gsap.fromTo(
            el,
            { yPercent: -10 },
            {
              yPercent: 10,
              scrollTrigger: {
                trigger: section,
                ...SCROLL_TRIGGER.scrub,
                pin: true,
                invalidateOnRefresh: true, // pin 使用時は必須
              },
            },
          );
        } else {
          // モバイル: ピン固定回避、パララックス量を縮小
          gsap.fromTo(
            el,
            { yPercent: -4 },
            {
              yPercent: 4,
              scrollTrigger: {
                trigger: section,
                ...SCROLL_TRIGGER.scrub,
              },
            },
          );
        }
      },
    );
  },
  { scope: containerRef },
);
```

**matchMedia の自動 revert**: `mm.add` 内で作成された tween / ScrollTrigger は、メディアクエリ条件が外れた時点で自動的に revert される。CSS の `!important` フォールバックは不要。

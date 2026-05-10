---
description: GSAP matchMedia パターン C (event handler / タイマー駆動) + パターン D (リスト stagger ScrollRevealGroup) — useCallback 禁止 / motionOk ref / mount-time GSAP cleanup
paths:
  - "src/app/(public*)/_components/**/*.tsx"
  - "src/app/(public*)/_shared/components/animations/**"
  - "src/app/(public*)/_shared/hooks/use-motion-preference*"
---

# GSAP matchMedia パターン C + D

> イベントハンドラ駆動（マウス・クリック・タイマー）+ リスト stagger（1 ScrollTrigger に集約）。React Compiler との衝突回避。

## パターン C: イベントハンドラ（useCallback 禁止）

マウスイベント / クリック等のイベントハンドラでは `useGSAP()` を使わないため、
`useMotionPreference()` フックで reduced-motion 設定を reactive に参照する。

**重要: `ref.current` を参照するイベントハンドラでは `useCallback` を使わない。**
React Compiler が `ref.current` を依存として推論し、`react-hooks/preserve-manual-memoization` エラーになる。
プレーン関数で定義すれば React Compiler が自動メモ化する。

```typescript
'use client'

import { useRef } from 'react'
import { gsap } from '@/public/lib/gsap-config'
import { useMotionPreference } from '@/public/hooks/use-motion-preference'
import { EASE } from '@/public/lib/animations'

function MagneticButton() {
  const ref = useRef<HTMLButtonElement>(null)
  const motionOk = useMotionPreference()

  // OK: プレーン関数（React Compiler が自動メモ化）
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!motionOk.current) return  // reduced-motion ガード
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const x = e.clientX - rect.left - rect.width / 2
    const y = e.clientY - rect.top - rect.height / 2
    gsap.to(el, { x: x * 0.3, y: y * 0.3, duration: 0.4, ease: 'power2.out' })
  }

  // NG: useCallback + ref.current（React Compiler エラー）
  // const handleMouseMove = useCallback((e: React.MouseEvent) => {
  //   if (!motionOk.current) return
  //   ...
  // }, [])

  const handleMouseLeave = () => {
    const el = ref.current
    if (!el) return
    gsap.to(el, { x: 0, y: 0, duration: 0.6, ease: EASE.outElastic })
  }

  return (
    <button ref={ref} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}>
      {/* ... */}
    </button>
  )
}
```

`useMotionPreference()` フック実装（`@/public/hooks/use-motion-preference.ts`）:

```typescript
"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "@/public/lib/gsap-config";

/**
 * gsap.matchMedia() ベースの reactive reduced-motion フック。
 * .current = true: アニメーション OK / .current = false: reduced-motion 有効
 * OS 設定変更時に自動更新される。
 */
export function useMotionPreference(): React.RefObject<boolean> {
  const motionOk = useRef(true);

  useGSAP(() => {
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: reduce)", () => {
      motionOk.current = false;
      return () => {
        motionOk.current = true;
      };
    });
  });

  return motionOk;
}
```

## タイマー / 状態駆動アニメーション（Pattern C 拡張）

カルーセル等の `setState` 駆動アニメーションは **`useGSAP` + `dependencies` を使わない**。
dependency 変更ごとに `gsap.context()` が revert（前回の inline style を巻き戻し）してフラッシュが発生する。

**正しいパターン**: ref + `gsap.to()` 直接呼び出し（Pattern C）:

```typescript
const activeIndexRef = useRef(0);
const motionOkRef = useMotionPreference();

// イベント駆動のクロスフェード — useGSAP を使わない
const crossfadeTo = (nextIndex: number) => {
  const prevEl = imageElsRef.current[activeIndexRef.current];
  const nextEl = imageElsRef.current[nextIndex];
  if (motionOkRef.current) {
    if (prevEl)
      gsap.to(prevEl, {
        opacity: 0,
        duration: DURATION.hero,
        ease: EASE.inOut,
      });
    if (nextEl)
      gsap.to(nextEl, {
        opacity: 1,
        duration: DURATION.hero,
        ease: EASE.inOut,
      });
  } else {
    if (prevEl) gsap.set(prevEl, { opacity: 0 });
    if (nextEl) gsap.set(nextEl, { opacity: 1 });
  }
  activeIndexRef.current = nextIndex;
  setActiveIndex(nextIndex);
};

// タイマー開始は useEffectEvent で deps 除外（React 19）
const onTimerStart = useEffectEvent(() => {
  startTimer();
});
useEffect(() => {
  onTimerStart();
  return stopTimer;
}, [hasMultiple, count]);

// アンマウント時の GSAP cleanup（Pattern C 要件）
useEffect(() => {
  const els = imageElsRef.current;
  return () => {
    for (const el of els) {
      if (el) gsap.killTweensOf(el);
    }
  };
}, []);
```

**実装例**: `src/app/(public)/_components/homepage/hero-section.tsx`

**Ken Burns の初期ズーム**: タイマー駆動（Pattern C）は mount 時に自動発火しないため、最初の画像のズーム開始には別途 `useGSAP` + `matchMedia`（Pattern A）が必要。Pattern A で初期ズーム → 以降は Pattern C の `crossfadeTo` 内で `gsap.fromTo` ズームを開始する。

## パターン D: リスト stagger（ScrollRevealGroup）

`.map` で N 個生成するカード・リストアイテムでは、**個別の `<ScrollReveal>` wrap を禁止**。
GSAP 公式推奨の「1 ScrollTrigger + stagger」に集約する。個別 ScrollReveal は N 個の ScrollTrigger を作り、
縦並びで大きなカードだと fold 外要素が `opacity:0` で待機する silent bug（「1 個目しか見えない」）を引き起こす。

```tsx
// NG: N ScrollTrigger + fold 外要素の待機 bug
{
  items.map((item, i) => (
    <ScrollReveal key={item.id} delay={i * 0.08}>
      <Card {...item} />
    </ScrollReveal>
  ));
}

// OK: 1 ScrollTrigger + stagger（公式推奨）
<ScrollRevealGroup className="grid gap-6">
  {items.map((item) => (
    <Card key={item.id} {...item} />
  ))}
</ScrollRevealGroup>;
```

`ScrollRevealGroup` は内部で `gsap.fromTo(items, {...}, { stagger, scrollTrigger: { trigger: container } })`
を `gsap.matchMedia("(prefers-reduced-motion: no-preference)")` でラップして実行。
コンテナ上端が viewport 85% に到達した時点で全子要素が連続発火する。

- デフォルト stagger: `STAGGER.element`（0.1）。上書きは `stagger={0.08}` prop
- ルート要素は `<div>` 固定。news archive 等で `<ul>/<li>` が欲しい場合も `<div className="divide-y border-y border-border divide-border">` に統一する（event-list / news-list で採用）
- 参照実装: `src/app/(public)/_shared/components/animations/scroll-reveal.tsx`
- 移行済み消費者: event-list-view / post-grid / space-grid / news-list / features-section / how-it-works-section / SpaceShowcaseSection

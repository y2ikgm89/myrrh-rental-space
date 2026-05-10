---
description: GSAP 基本ルール (useGSAP / scope / gsap-config 経由 import) + アニメーション定数 (DURATION / EASE / STAGGER / SCROLL_TRIGGER / PARALLAX)
paths:
  - "src/app/(public*)/_shared/lib/gsap*"
  - "src/app/(public*)/_shared/lib/animations*"
  - "src/app/(public*)/_components/**/*.tsx"
  - "src/app/(public*)/_shared/components/animations/**"
---

# GSAP 基本ルール + アニメーション定数

> `useGSAP()` + `scope` 必須、`gsap-config.ts` 経由 import、`animations.ts` 定数 (DURATION / EASE / STAGGER / SCROLL_TRIGGER / PARALLAX) でマジックナンバー禁止。

## useGSAP() 使用（useEffect 禁止）

`@gsap/react` の `useGSAP()` フックを使用する。生の `useEffect` + `gsap.context()` は禁止。
`useGSAP()` はアンマウント時に全 tween / ScrollTrigger / SplitText を自動 revert する。

```typescript
// NG: useEffect + 手動クリーンアップ
useEffect(() => {
  const ctx = gsap.context(() => {
    gsap.to(ref.current, { y: 100 });
  }, ref);
  return () => ctx.revert();
}, []);

// OK: useGSAP + scope（自動クリーンアップ）
useGSAP(
  () => {
    gsap.to(ref.current, { y: 100 });
  },
  { scope: ref },
);
```

## scope は必須

`useGSAP()` の第 2 引数に `{ scope: containerRef }` を指定する。
セレクタ文字列をスコープ限定にし、他コンポーネントへの漏れを防ぐ。

```typescript
// NG: scope なし（グローバルセレクタが漏れる）
useGSAP(() => {
  gsap.to(".item", { y: 20 });
});

// OK: scope でスコープを限定
const containerRef = useRef<HTMLDivElement>(null);
useGSAP(
  () => {
    gsap.to(".item", { y: 20 }); // containerRef 内の .item のみに作用
  },
  { scope: containerRef },
);
```

## gsap-config.ts 経由で import（直接 import 禁止）

```typescript
// NG: gsap や gsap/ScrollTrigger を直接 import
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

// OK: gsap-config.ts 経由
import { gsap, ScrollTrigger } from "@/public/lib/gsap-config";
import { useGSAP } from "@gsap/react";
```

`gsap-config.ts` 実装（変更禁止）:

```typescript
"use client";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(ScrollTrigger, useGSAP);
export { gsap, ScrollTrigger };

// @deprecated — 新規コードでは gsap.matchMedia() を使用
export function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
```

## アニメーション定数（`@/public/lib/animations.ts`）

**マジックナンバー禁止。** 全アニメーションでこの定数を使用する。

```typescript
// DURATION — 秒単位
export const DURATION = {
  fast: 0.3, // ホバー、フィードバック
  normal: 0.6, // 一般的な遷移
  slow: 0.8, // 入場アニメーション
  xslow: 1.2, // 大きな遷移
  hero: 1.5, // Hero 専用
} as const;

// EASE — GSAP 形式
export const EASE = {
  outExpo: "expo.out", // スムーズな減速 — 一般的な入場
  outQuad: "power2.out", // 中程度の減速 — UI操作、オーバーレイ
  inQuad: "power2.in", // 中程度の加速 — 退場アニメーション
  outCubic: "power3.out", // 強い減速 — スタガー入場
  outQuart: "power4.out", // 自然な減速 — テキストリビール
  inOutQuart: "quart.inOut", // スムーズな入出 — スクロール連動
  inOutSine: "sine.inOut", // 穏やかな往復 — ループインジケーター
  outElastic: "elastic.out(1, 0.3)", // 弾性リターン — MagneticButton
  none: "none", // リニア — scrub アニメーション
} as const;

// STAGGER — 秒単位
export const STAGGER = {
  char: 0.03, // 文字単位リビール
  word: 0.08, // 単語単位リビール
  line: 0.15, // 行単位リビール
  card: 0.12, // カードグリッド
  element: 0.1, // 一般的な要素
} as const;

// SCROLL_TRIGGER プリセット
export const SCROLL_TRIGGER = {
  reveal: {
    start: "top 85%",
    end: "top 20%",
    toggleActions: "play none none none" as const,
  },
  scrub: {
    start: "top bottom",
    end: "bottom top",
    scrub: 1,
  },
} as const;

// PARALLAX 速度プリセット
export const PARALLAX = {
  subtle: 0.3, // 背景の微細な動き
  normal: 0.5, // 標準パララックス
} as const;
```

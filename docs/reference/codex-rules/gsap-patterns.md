---
paths:
  - src/app/(public*)/**
---

# GSAP パターンルール

> Codex 用参照ドキュメント。公開ページの GSAP 実装はこのファイルを正本とする。
> GSAP 3.14.2 / @gsap/react 2.1 / ScrollTrigger / Lenis 1.3.17 対応

## 基本ルール

### useGSAP() 使用（useEffect 禁止）

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

### scope は必須

`useGSAP()` の第2引数に `{ scope: containerRef }` を指定する。
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

### gsap-config.ts 経由で import（直接 import 禁止）

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

---

## パターン A: matchMedia + prefers-reduced-motion（標準 — 全アニメーションで必須）

[GSAP公式 Accessibility ガイド](https://gsap.com/resources/a11y) 推奨パターン。
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

---

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

---

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

---

## ScrollTrigger パターン

### 基本スクロールアニメーション（入場系）

`SCROLL_TRIGGER.reveal` プリセットを使用:

```typescript
useGSAP(
  () => {
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.fromTo(
        ".item",
        { opacity: 0, y: 40 },
        {
          opacity: 1,
          y: 0,
          duration: DURATION.slow,
          ease: EASE.outQuart,
          stagger: STAGGER.element,
          scrollTrigger: {
            trigger: containerRef.current,
            ...SCROLL_TRIGGER.reveal,
            // start: 'top 85%'
            // end: 'top 20%'
            // toggleActions: 'play none none none'
          },
        },
      );
    });
  },
  { scope: containerRef },
);
```

### スクラブ（scrub）パララックス

`SCROLL_TRIGGER.scrub` プリセットを使用。**ease は必ず `'none'`**:

```typescript
useGSAP(
  () => {
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      gsap.set(imageRef.current, { scale: 1.15 }); // parallax 分の余裕を作る

      gsap.fromTo(
        imageRef.current,
        { y: -50 },
        {
          y: 50,
          ease: "none", // scrub アニメーションに custom ease 禁止
          scrollTrigger: {
            trigger: containerRef.current,
            ...SCROLL_TRIGGER.scrub,
            // start: 'top bottom'
            // end: 'bottom top'
            // scrub: 1
          },
        },
      );
    });
  },
  { scope: containerRef, dependencies: [speed] },
);
```

### ピン固定（pin）

`pin: true` 使用時は **`invalidateOnRefresh: true` が必須**:

```typescript
useGSAP(
  () => {
    const mm = gsap.matchMedia();
    mm.add(
      {
        isDesktop: "(min-width: 800px)",
        noPreference: "(prefers-reduced-motion: no-preference)",
      },
      (ctx) => {
        const { isDesktop, noPreference } = ctx.conditions ?? {};
        if (!noPreference || !isDesktop) return; // モバイルではピン固定回避

        const tl = gsap.timeline({
          scrollTrigger: {
            trigger: sectionRef.current,
            start: "top top",
            end: "bottom top",
            scrub: 1,
            pin: true,
            invalidateOnRefresh: true, // 必須: リサイズ時に再計算
          },
        });
        tl.to(".layer-1", { yPercent: -30 }).to(
          ".title",
          { opacity: 0, y: -50 },
          "<",
        );
      },
    );
  },
  { scope: containerRef },
);
```

### ScrollTrigger 3 パターン要約

| パターン                 | 主要設定                                                               | 用途                                       |
| ------------------------ | ---------------------------------------------------------------------- | ------------------------------------------ |
| **入場アニメーション**   | `toggleActions: 'play none none none'`, `start: 'top 85%'`             | 要素がビューポートに入った時に1回再生      |
| **スクラブパララックス** | `scrub: 1`, `start: 'top bottom'`, `end: 'bottom top'`, `ease: 'none'` | スクロール位置に連動する連続アニメーション |
| **ピン固定**             | `pin: true`, `scrub: 1`, `invalidateOnRefresh: true`                   | 横スクロール、ステップ進行（モバイル禁止） |

---

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
  outQuart: "power4.out", // 自然な減速 — テキストリビール
  inOutQuart: "quart.inOut", // スムーズな入出 — スクロール連動
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

---

## Lenis スムーススクロール

### useLenis() フック（消費側）

```typescript
"use client";

import { useLenis } from "lenis/react";

// インスタンス取得
const lenis = useLenis();

// スクロールイベント購読
useLenis((lenis) => {
  const progress = lenis.progress; // 0-1
  const velocity = lenis.velocity;
});
```

### SmoothScrollProvider（内部 — Lenis 公式推奨パターン）

```typescript
// GSAP ticker で Lenis の RAF を駆動
const lenis = new Lenis({ duration: 1.2 }); // autoRaf: false（デフォルト）
lenis.on("scroll", ScrollTrigger.update); // ScrollTrigger との同期

const tickerCb = (time: number) => {
  lenis.raf(time * 1000);
};
gsap.ticker.add(tickerCb);
gsap.ticker.lagSmoothing(0); // ラグ補正無効化
gsap.config({ autoSleep: 0 }); // ticker スリープ防止（デフォルト ~2秒で停止しスクロールがデッドロック）

ScrollTrigger.refresh(); // Lenis 初期化後に必須

// 動的コンテンツ対応: ResizeObserver で高さ変化を検知
const ro = new ResizeObserver(() => {
  ScrollTrigger.refresh(true);
});
ro.observe(document.body);
```

**設計ポイント**:

- `autoRaf: false`（デフォルト）— 同一 RAF フレーム内で Lenis 補間 → ScrollTrigger 更新 → GSAP tween 適用が実行され、フレーム同期が保証される
- `autoSleep: 0` — デフォルト（120フレーム ~2秒）でアイドル後に ticker が停止し Lenis がデッドロックするため必須
- `refresh(true)` — スクロール完了後に安全にトリガー位置を再計算（安全モード）
- `ReactLenis` コンポーネントは使用しない。`LenisContext` を直接提供し `useLenis()` との互換性を維持

### ScrollTrigger との連携注意事項

`SmoothScrollProvider` を使用している場合、`ScrollTrigger.refresh()` は Provider が管理する。
コンポーネント内では DOM 動的変更後（画像ロード完了等）のみ追加で呼び出す。

---

## Tailwind CSS 4 と GSAP の transform 共存

**GSAP がアニメーションする要素では Tailwind の transform クラス（`scale-*`, `rotate-*`, `translate-*`）を使わない。**

Tailwind CSS 4 は個別 CSS プロパティ（`scale`, `rotate`, `translate`）を生成し、GSAP は `transform` プロパティに書き込む。
同一要素に共存すると `clearProps` の不完全動作やマトリクス分解の汚染が発生する。

```typescript
// NG: GSAP アニメーション対象に Tailwind transform クラスを混在
<div className="scale-110 translate-y-4">  {/* GSAP も y をアニメーション */}

// OK: GSAP で transform を一元管理
gsap.set(imageRef.current, { scale: 1.15 })  // 初期値も GSAP で設定

// OK: GSAP が触らない要素は Tailwind のまま
<Image className="scale-110" />  // 対象外の子要素
```

---

## レスポンシブ規約

| 機能             | デスクトップ                           | モバイル                        |
| ---------------- | -------------------------------------- | ------------------------------- |
| パララックス量   | `yPercent: 30`（PARALLAX.normal × 60） | `yPercent: 12`（× 0.4 に縮小）  |
| ピン固定         | `pin: true`                            | **禁止**（通常スクロール化）    |
| 横スクロール     | `pin: true + x`                        | **縦スクロールに変換**          |
| stagger          | `STAGGER.card = 0.12`                  | `STAGGER.element = 0.1`（短縮） |
| ビューポート単位 | `100svh`                               | `100svh`（`100vh` 禁止）        |

---

## 禁止事項

1. **reduced-motion 対応省略禁止** — 全アニメーションで `gsap.matchMedia()` パターン A / B を使用。`prefersReducedMotion()` 直接呼出は非推奨。
2. **`useEffect` 内での GSAP 使用禁止** — `useGSAP()` + `scope` を使用
3. **scope なしの `useGSAP()` 禁止** — `{ scope: containerRef }` は必須
4. **`gsap` / `gsap/ScrollTrigger` の直接 import 禁止** — `gsap-config.ts` 経由
5. **`useCallback` + `ref.current` の組み合わせ禁止** — イベントハンドラはプレーン関数で定義（React Compiler が自動メモ化）
6. **`Math.random()` 禁止** — 決定的ハッシュ関数を使用（React Compiler 互換）
7. **`invalidateOnRefresh` 省略禁止（`pin: true` 使用時）**
8. **scrub パララックスにカスタム ease 禁止** — `ease: 'none'`（リニア）を維持
9. **モバイルでの `pin: true` 禁止** — `gsap.matchMedia()` のブレークポイント分岐で回避
10. **`markers: true` の本番残存禁止**
11. **`top` / `left` プロパティのアニメーション禁止** — `x`, `y`, `xPercent`, `yPercent` を使用
12. **アニメーション定数（`animations.ts`）外のマジックナンバー禁止** — duration / ease / stagger は定数を使用

---

## ファイル配置

| パス                                                     | 内容                                                                         |
| -------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `@/public/lib/gsap-config.ts`                            | GSAP 中央設定、プラグイン登録                                                |
| `@/public/lib/animations.ts`                             | DURATION / EASE / STAGGER / SCROLL_TRIGGER / PARALLAX 定数                   |
| `@/public/hooks/use-motion-preference.ts`                | `gsap.matchMedia()` ベースの reactive reduced-motion フック（パターン C 用） |
| `@/public/components/providers/SmoothScrollProvider.tsx` | Lenis + GSAP ticker 同期（`lenis/react` LenisContext 提供）                  |
| `@/public/components/animations/ScrollReveal.tsx`        | スクロール入場アニメーション（パターン A-1 の実装例）                        |
| `@/public/components/animations/SplitText.tsx`           | テキスト分割スタガーアニメーション（パターン A-1 の実装例）                  |
| `@/public/components/animations/ParallaxImage.tsx`       | scrub パララックス画像（パターン A-1 の実装例）                              |
| `@/public/components/animations/MagneticButton.tsx`      | マウス追従マグネットボタン（パターン C の実装例）                            |

> 追加の API 詳細は [GSAP docs](https://gsap.com/docs/v3/) と既存実装を参照。

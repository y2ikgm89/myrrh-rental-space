---
description: GSAP コアルール（基本ルール・アニメーション定数・レスポンシブ規約・禁止事項・ファイル配置・Gotchas）
paths:
  - "src/app/(public*)/_shared/lib/gsap*"
  - "src/app/(public*)/_shared/lib/animations*"
  - "src/app/(public*)/_shared/components/providers/lenis-provider*"
  - "src/app/(public*)/_shared/lib/a11y/motion*"
  - "src/app/(public*)/_components/**/*.tsx"
  - "src/app/(public*)/_shared/components/animations/**"
---

# GSAP パターン — コアルール

> GSAP 3.14.2 / @gsap/react 2.1.2 / ScrollTrigger / Lenis 1.3.19 対応（`package.json` と `bun.lock` の解決版に合わせる）

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
13. **リスト `.map` 内の個別 `<ScrollReveal delay={i * 0.08}>` wrap 禁止** — パターン D の `ScrollRevealGroup`（1 ScrollTrigger + stagger）を使う。N ScrollTrigger 生成 + fold 外要素 opacity:0 待機の silent bug 防止

---

## ファイル配置

| パス                                                     | 内容                                                                         |
| -------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `@/public/lib/gsap-config.ts`                            | GSAP 中央設定、プラグイン登録                                                |
| `@/public/lib/animations.ts`                             | DURATION / EASE / STAGGER / SCROLL_TRIGGER / PARALLAX 定数                   |
| `@/public/hooks/use-motion-preference.ts`                | `gsap.matchMedia()` ベースの reactive reduced-motion フック（パターン C 用） |
| `@/public/components/providers/SmoothScrollProvider.tsx` | Lenis + GSAP ticker 同期（`lenis/react` LenisContext 提供）                  |
| `@/public/components/animations/scroll-reveal.tsx`       | スクロール入場アニメーション（パターン A-1 の実装例）                        |
| `@/public/components/animations/split-text.tsx`          | テキスト分割スタガーアニメーション（パターン A-1 の実装例）                  |
| `@/public/components/animations/parallax-image.tsx`      | scrub パララックス画像（パターン A-1 の実装例）                              |
| `@/public/components/animations/magnetic-button.tsx`     | マウス追従マグネットボタン（パターン C の実装例）                            |

> **詳細リファレンス**: `docs/reference/claude-rules/gsap-reference.md`

## Gotchas

- **`gsap.from(el, { opacity: 0 })` 禁止 — `gsap.fromTo` を使用** — `gsap.from` は要素に `opacity: 0` をインラインセットするため、GSAP が発火しない場合（SSR、reduced-motion、ScrollTrigger 未到達）にコンテンツが不可視のまま。`gsap.fromTo(el, { opacity: 0 }, { opacity: 1 })` なら CSS デフォルト `opacity: 1` が保持され、GSAP がクライアントで上書きする
- **`ScrollReveal` ラッパー内のカードに `border-b last:border-b-0` 禁止** — `ScrollReveal` の `<div>` が `:last-child` を壊し、全カードで最後の線が消える。親要素に `divide-y divide-border` を使用して区切り線を管理する。実装例: `events/_components/event-list-view.tsx`
- **テキストの DOM 分割（SplitText 風）は禁止** — テキストを `<span class="inline-block">` に分割すると日本語テキストが縦折れし、SSR↔Client の hydration mismatch が発生する。SplitText はコンテナ全体の fade-up のみ行い、個別文字/単語の DOM 分割はしない
- **Cormorant Garamond の letter-spacing は負値または 0 にする** — 正の letter-spacing（0.06em 等）は Latin テキスト向けだが、CSS は日本語フォールバック（Noto Sans JP）にも同じ値を適用するため、日本語見出しが横に広がり折れる。`-0.01em` 以下を使用
- **`font-heading` (Cormorant Garamond) で数字+漢字の混合テキスト禁止** — 年月表示（`2026年4月`）等で数字と漢字のベースラインがずれる。sans (`font-sans` / デフォルト) を使用し、`tracking-wide` で可読性を確保。`font-heading` は英語見出し・日付の数字単体（EventCard の日番号等）に限定
- **`useGSAP` 外の GSAP アニメーションには `useEffect` cleanup 必須** — イベントハンドラで `gsap.fromTo`/`gsap.to` を直接呼ぶ場合、`useEffect` の cleanup で `gsap.killTweensOf(element)` を呼ぶ。ref をクリーンアップ関数内で使う場合はローカル変数にキャプチャする（`exhaustive-deps` 警告回避）
- **`useGSAP` + `dependencies` で状態駆動アニメーションを実装しない** — dependency 変更ごとに `gsap.context()` が revert（前回の inline style を巻き戻し）してフラッシュが発生する。タイマー/クリック駆動のクロスフェード等は Pattern C（イベント駆動: `crossfadeTo` 関数 + `activeIndexRef` + `useMotionPreference()`）で実装し、アンマウント時に `useEffect` cleanup で `gsap.killTweensOf()` を呼ぶ。実装例: `_components/homepage/hero-section.tsx`
- **`exhaustive-deps` は `react-hooks` と `@eslint-react` の2つが有効** — `eslint-disable-next-line react-hooks/exhaustive-deps` では `@eslint-react/exhaustive-deps` が残る。`useEffectEvent`（React 19 stable）で根本解決する。`eslint-disable` は使わない
- **`useEffect` 内のイベントリスナーから状態変更関数を呼ぶ場合は `useEffectEvent` でラップ** — touch handler の `handleTouchEnd` から `navigate()` を呼ぶ場合、`navigate` を deps に入れるとリスナー再登録が頻発する。`const onSwipe = useEffectEvent((dir) => navigate(dir))` でラップし effect 内では `onSwipe` を呼ぶ。`useEffectEvent` の戻り値は deps 配列に含めない（ESLint が警告）

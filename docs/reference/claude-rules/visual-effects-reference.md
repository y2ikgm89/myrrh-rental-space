# ビジュアルエフェクト 詳細リファレンス

> このファイルは `.claude/rules/visual-effects-patterns.md` の詳細セクション。
> コア原則とルールは `.claude/rules/visual-effects-patterns.md` を参照。

## VisualEffectsProvider 完全実装

エフェクトレベルとパフォーマンスバジェットを提供するContext Provider。

### 完全実装

```typescript
'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'

// --- 型定義 ---
export type EffectLevel = 1 | 2 | 3 | 4

export interface PerformanceBudget {
  readonly targetFps: number
  readonly maxWebGLContexts: number
  readonly allowThreeJs: boolean
  readonly allowPixiJs: boolean
}

interface VisualEffectsContextValue {
  readonly effectLevel: EffectLevel
  readonly budget: PerformanceBudget
  readonly capabilities: DeviceCapabilities | null
  readonly degradeTo: (level: EffectLevel) => void
}

// --- 定数 ---
export const PERFORMANCE_BUDGETS: Record<EffectLevel, PerformanceBudget> = {
  1: { targetFps: 30, maxWebGLContexts: 0, allowThreeJs: false, allowPixiJs: false },
  2: { targetFps: 45, maxWebGLContexts: 0, allowThreeJs: false, allowPixiJs: false },
  3: { targetFps: 60, maxWebGLContexts: 4, allowThreeJs: true,  allowPixiJs: false },
  4: { targetFps: 60, maxWebGLContexts: 8, allowThreeJs: true,  allowPixiJs: true  },
}

function toEffectLevel(n: number): EffectLevel {
  return Math.max(1, Math.min(4, Math.round(n))) as EffectLevel
}

// --- Context ---
const VisualEffectsContext = createContext<VisualEffectsContextValue>({
  effectLevel: 1,
  budget: PERFORMANCE_BUDGETS[1],
  capabilities: null,
  degradeTo: () => {},
})

// --- Provider ---
export function VisualEffectsProvider({ children }: { children: ReactNode }) {
  const [effectLevel, setEffectLevel] = useState<EffectLevel>(1)
  const [capabilities, setCapabilities] = useState<DeviceCapabilities | null>(null)

  // GPU検出（非同期、初回のみ）
  useEffect(() => {
    let cancelled = false

    async function detect() {
      try {
        const caps = await detectDeviceCapabilities()
        if (!cancelled) {
          setCapabilities(caps)
          setEffectLevel(caps.effectLevel)
        }
      } catch {
        // 検出失敗 → L1 のまま
      }
    }

    detect()
    return () => { cancelled = true }
  }, [])

  // prefers-reduced-motion 動的監視
  useEffect(() => {
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)')
    const handleChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        setEffectLevel(1)
      }
    }
    mql.addEventListener('change', handleChange)
    return () => mql.removeEventListener('change', handleChange)
  }, [])

  // ダウングレードのみ許可
  const degradeTo = useCallback((level: EffectLevel) => {
    setEffectLevel((current) => toEffectLevel(Math.min(current, level)))
  }, [])

  const value: VisualEffectsContextValue = {
    effectLevel,
    budget: PERFORMANCE_BUDGETS[effectLevel],
    capabilities,
    degradeTo,
  }

  return (
    <VisualEffectsContext.Provider value={value}>
      {children}
    </VisualEffectsContext.Provider>
  )
}

// --- Hook ---
export function useVisualEffects(): VisualEffectsContextValue {
  return useContext(VisualEffectsContext)
}
```

### 使用例

```typescript
// コンポーネントでの使用
const { effectLevel, budget, degradeTo } = useVisualEffects();

// L3以上でThree.js有効
if (effectLevel >= 3 && budget.allowThreeJs) {
  // ThreeCanvas を描画
}

// パフォーマンス低下時にダウングレード
if (fps < 30) {
  degradeTo(toEffectLevel(effectLevel - 1));
}
```

### layout.tsx での配置

```typescript
// (public)/layout.tsx
import { VisualEffectsProvider } from './_shared/components/effects/core/VisualEffectsProvider'

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <VisualEffectsProvider>
          {children}
        </VisualEffectsProvider>
      </body>
    </html>
  )
}
```

## detect-gpu API 詳細

```typescript
import { getGPUTier } from 'detect-gpu'

const gpuTier = await getGPUTier({
  // ベンチマークデータURL（デフォルト: unpkg CDN）
  benchmarksURL?: string,
  // 既存WebGLコンテキストを渡す（一時的なコンテキスト生成を回避）
  glContext?: WebGLRenderingContext | WebGL2RenderingContext,
  // パフォーマンスが低い場合にフォールバック結果を返す
  failIfMajorPerformanceCaveat?: boolean,  // default: false
  // モバイル/デスクトップのティアしきい値（FPS）
  mobileTiers?: number[],   // default: [0, 15, 30, 60]
  desktopTiers?: number[],  // default: [0, 15, 30, 60]
  // テスト用オーバーライド
  override?: {
    renderer?: string,
    isMobile?: boolean,
    screenSize?: { width: number, height: number },
  },
})

// 戻り値
// {
//   tier: 0 | 1 | 2 | 3,     // GPUティア
//   isMobile: boolean,         // モバイルデバイスか
//   type: 'BENCHMARK' | 'FALLBACK' | 'BLOCKLISTED',
//   fps: number,               // 推定FPS
//   gpu: string                // GPUモデル名
// }
```

## ブレンドモード / コンポジティングレイヤー

CSS `mix-blend-mode` / `background-blend-mode` による視覚的合成。L1 から使用可能。

### mix-blend-mode ガイド

| モード       | 効果             | 用途                                       | パフォーマンス |
| ------------ | ---------------- | ------------------------------------------ | -------------- |
| `multiply`   | 暗い色が優先     | カラーフィルター、写真にブランドカラー重ね | Good           |
| `screen`     | 明るい色が優先   | 光の重ね、フレア効果                       | Good           |
| `overlay`    | コントラスト強調 | テクスチャ合成、画像の質感追加             | Good           |
| `difference` | 色反転           | カスタムカーソル、ダイナミックテキスト     | Good           |
| `exclusion`  | 柔らかい反転     | 背景上のテキスト可読性                     | Good           |

### isolation（ブレンドモード分離）

```css
/* 親要素でisolationを設定し、ブレンドの影響範囲を限定 */
.blend-container {
  isolation: isolate; /* 子要素のブレンドがこのコンテナ外に漏れない */
}

.blend-child {
  mix-blend-mode: overlay;
}
```

### Three.js / PixiJS 統合

WebGL Canvas と HTML 要素のブレンドは `mix-blend-mode` をCanvas wrapper に適用:

```css
.three-canvas-wrapper {
  mix-blend-mode: screen; /* 3D要素を明るく合成 */
  pointer-events: none;
}
```

**注意**: `mix-blend-mode` は `isolation` コンテキスト外ではページ全体に影響する可能性がある。`isolation: isolate` でスコープを限定すること。GPU合成レイヤーを生成するため、過度な使用はメモリ消費に注意。

## カスタムカーソル（L2+）

ブランドサイトで使用されるカスタムカーソル。L2 以上で有効。
→ 参考: [tomore.jp](https://www.tomore.jp/)

```typescript
'use client'

import { useRef, useCallback } from 'react'
import { useGSAP } from '@gsap/react'
import { gsap, prefersReducedMotion } from '../lib/gsap-config'

export function CustomCursor() {
  const cursorRef = useRef<HTMLDivElement>(null)

  const setupCursor = useCallback(() => {
    if (prefersReducedMotion() || !cursorRef.current) return

    const cursor = cursorRef.current
    // quickTo で 60fps カーソル追従
    const xTo = gsap.quickTo(cursor, 'x', { duration: 0.3, ease: 'power3.out' })
    const yTo = gsap.quickTo(cursor, 'y', { duration: 0.3, ease: 'power3.out' })

    const handleMove = (e: MouseEvent) => {
      xTo(e.clientX)
      yTo(e.clientY)
    }

    window.addEventListener('pointermove', handleMove)
    return () => window.removeEventListener('pointermove', handleMove)
  }, [])

  useGSAP(setupCursor)

  return (
    <div
      ref={cursorRef}
      className="pointer-events-none fixed top-0 left-0 z-50 h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-primary mix-blend-difference"
    />
  )
}
```

**注意**: `pointer-events: none` + `mix-blend-difference` + `position: fixed` が基本構成。
モバイルでは非表示（`hidden md:block`）。ホバー対象要素では `scale: 1.5` に拡大。

## Lottie ベクターアニメーション統合

ブランドロゴやアイコンの精密なアニメーション。L1 でも使用可（軽量）。
→ 参考: [tomore.jp](https://www.tomore.jp/) で採用

```typescript
// next/dynamic でSSR除外
const LottiePlayer = dynamic(
  () => import('lottie-react').then((mod) => mod.default),
  { ssr: false }
)

// 使用例
<LottiePlayer
  animationData={brandAnimation}
  loop={false}
  autoplay={true}
  className="w-32 h-32"
/>
```

**配置**: Lottie JSON は `public/animations/` に配置。

## CSS scroll-driven animation（L1 パフォーマンス最適化）

CSS ネイティブの `animation-timeline: scroll()` はメインスレッド外で実行されるため、
L1（CSS only）レベルのパララックスとして最も高パフォーマンス。未サポートブラウザでは GSAP にフォールバック。

### ブラウザ対応状況（2025年末）

| ブラウザ    | `animation-timeline: scroll()` |
| ----------- | ------------------------------ |
| Chrome 115+ | ✅ 対応                        |
| Edge 115+   | ✅ 対応                        |
| Opera 101+  | ✅ 対応                        |
| Firefox     | ⚠️ フラグ付き                  |
| Safari      | ❌ 未対応                      |

### フォールバック戦略

```typescript
// 検出パターン
const supportsScrollTimeline = CSS.supports("animation-timeline", "scroll()");

if (supportsScrollTimeline) {
  // CSS ネイティブ — JS 不要、メインスレッド外で実行
  document.documentElement.classList.add("scroll-timeline-supported");
} else {
  // GSAP ScrollTrigger フォールバック
  import("../../lib/gsap-config").then(({ gsap }) => {
    gsap.to(".parallax-bg", {
      yPercent: -20,
      scrollTrigger: { trigger: ".hero", scrub: true },
    });
  });
}
```

```css
/* CSS scroll-driven parallax（対応ブラウザのみ） */
@supports (animation-timeline: scroll()) {
  .parallax-bg {
    animation: parallax-move linear;
    animation-timeline: scroll();
  }

  @keyframes parallax-move {
    from {
      transform: translateY(0);
    }
    to {
      transform: translateY(-20%);
    }
  }
}
```

**注意**: polyfill は存在するがメインスレッドで実行されるため、パフォーマンスメリットが失われる。GSAP フォールバックの方が安定。

## CSSオンリーエフェクトカタログ（L1）

L1（JSなし）で使用可能なCSSエフェクト。`prefers-reduced-motion: reduce` 時は静的フォールバック。

### グラデーションアニメーション（@property）

```css
@property --hue {
  syntax: "<number>";
  inherits: false;
  initial-value: 0;
}

.animated-gradient {
  background: oklch(0.7 0.15 var(--hue));
  animation: hue-rotate 8s linear infinite;
}

@keyframes hue-rotate {
  to {
    --hue: 360;
  }
}
```

### テキストグラデーション（background-clip: text）

```css
.gradient-text {
  background: linear-gradient(135deg, oklch(0.6 0.2 240), oklch(0.7 0.15 300));
  background-clip: text;
  -webkit-background-clip: text;
  color: transparent;
}
```

### backdrop-filter（すりガラス）

```css
.frosted-glass {
  background: oklch(1 0 0 / 0.1);
  backdrop-filter: blur(12px) saturate(1.2);
  -webkit-backdrop-filter: blur(12px) saturate(1.2);
  border: 1px solid oklch(1 0 0 / 0.15);
}
```

### mix-blend-mode パターン

```css
.blend-overlay {
  mix-blend-mode: overlay;
} /* 画像にテクスチャ重ね */
.blend-multiply {
  mix-blend-mode: multiply;
} /* カラーフィルター */
.blend-screen {
  mix-blend-mode: screen;
} /* 明るい重ね合わせ */
.blend-difference {
  mix-blend-mode: difference;
} /* 反転コントラスト */
.blend-exclusion {
  mix-blend-mode: exclusion;
} /* 柔らかな反転 */
```

### CSS masks / clip-path

```css
/* SVGマスクで切り抜き */
.masked-image {
  mask-image: url("/masks/organic-shape.svg");
  mask-size: cover;
  mask-repeat: no-repeat;
}

/* clip-path で幾何学的切り抜き */
.clipped-section {
  clip-path: polygon(0 5%, 100% 0, 100% 95%, 0 100%);
}

/* clip-path 円形リビール */
.circle-reveal {
  clip-path: circle(0% at 50% 50%);
  transition: clip-path 0.8s cubic-bezier(0.16, 1, 0.3, 1);
}
.circle-reveal.is-visible {
  clip-path: circle(75% at 50% 50%);
}
```

### @keyframes 呼吸エフェクト

```css
.breathing {
  animation: breathe 4s ease-in-out infinite;
}

@keyframes breathe {
  0%,
  100% {
    transform: scale(1);
    opacity: 0.8;
  }
  50% {
    transform: scale(1.03);
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .breathing {
    animation: none;
  }
}
```

### CSS filter アニメーション

```css
.blur-reveal {
  filter: blur(8px);
  transition: filter 0.6s ease-out;
}
.blur-reveal.is-visible {
  filter: blur(0);
}

.sepia-hover:hover {
  filter: sepia(0.3) saturate(1.4);
  transition: filter 0.3s ease;
}
```

### グリッチエフェクト

```css
.glitch {
  position: relative;
}
.glitch::before,
.glitch::after {
  content: attr(data-text);
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}
.glitch::before {
  animation: glitch-shift 3s infinite;
  clip-path: inset(40% 0 60% 0);
  color: oklch(0.7 0.3 0);
}
.glitch::after {
  animation: glitch-shift 3s infinite reverse;
  clip-path: inset(60% 0 40% 0);
  color: oklch(0.7 0.3 240);
}

@keyframes glitch-shift {
  0%,
  100% {
    transform: translate(0);
  }
  20% {
    transform: translate(-3px, 2px);
  }
  40% {
    transform: translate(3px, -1px);
  }
  60% {
    transform: translate(-1px, 3px);
  }
  80% {
    transform: translate(2px, -2px);
  }
}
```

### テキストシャドウ（ネオン、エンボス、3D）

```css
/* ネオン */
.neon-text {
  text-shadow:
    0 0 7px currentColor,
    0 0 20px currentColor,
    0 0 40px oklch(0.7 0.2 240);
}

/* エンボス */
.emboss-text {
  text-shadow:
    1px 1px 1px oklch(1 0 0 / 0.3),
    -1px -1px 1px oklch(0 0 0 / 0.2);
}

/* 3D押し出し */
.text-3d {
  text-shadow:
    1px 1px 0 oklch(0.5 0.1 240),
    2px 2px 0 oklch(0.45 0.1 240),
    3px 3px 0 oklch(0.4 0.1 240),
    4px 4px 0 oklch(0.35 0.1 240);
}
```

### ボーダーグラデーション

```css
.gradient-border {
  border: 2px solid transparent;
  background:
    linear-gradient(var(--color-background), var(--color-background))
      padding-box,
    linear-gradient(135deg, oklch(0.6 0.2 240), oklch(0.7 0.15 300)) border-box;
  border-radius: 12px;
}
```

### ブラウザ対応注意事項

| エフェクト            | Chrome | Firefox | Safari | 備考                     |
| --------------------- | ------ | ------- | ------ | ------------------------ |
| `@property`           | 85+    | 128+    | 15.4+  | グラデーション補間に必須 |
| `backdrop-filter`     | 76+    | 103+    | 9+     | `-webkit-` prefix 併記   |
| `mix-blend-mode`      | 41+    | 32+     | 8+     | ほぼ全対応               |
| `mask-image` (SVG)    | 120+   | 53+     | 15.4+  | `-webkit-` prefix 併記   |
| `clip-path` (polygon) | 55+    | 54+     | 13.1+  | ほぼ全対応               |
| `animation-timeline`  | 115+   | ⚠️ flag | ❌     | L1で最もモダン           |

## View Transitions API

ページ遷移・状態変化に伴うクロスフェードやスライドアニメーション。
エフェクトレベル非依存（ブラウザ対応状況のみで判定）。

### ブラウザ対応状況（2025年末）

| ブラウザ    | SPA (同一ドキュメント) | MPA (クロスドキュメント) |
| ----------- | ---------------------- | ------------------------ |
| Chrome 111+ | ✅                     | Chrome 126+ ✅           |
| Edge 111+   | ✅                     | Edge 126+ ✅             |
| Safari 18+  | ✅                     | ❌                       |
| Firefox     | ⚠️ 実装中              | ❌                       |

### SPAパターン（document.startViewTransition）

```typescript
function navigateTo(url: string) {
  if (!document.startViewTransition) {
    // フォールバック: 即座に遷移
    router.push(url);
    return;
  }

  document.startViewTransition(() => {
    router.push(url);
  });
}
```

### CSSカスタマイズ

```css
/* デフォルトのクロスフェードをカスタマイズ */
::view-transition-old(root) {
  animation: fade-out 0.3s ease-out;
}
::view-transition-new(root) {
  animation: fade-in 0.3s ease-in;
}

/* 特定要素にユニーク名を付与して個別アニメーション */
.hero-image {
  view-transition-name: hero-image;
}

::view-transition-old(hero-image) {
  animation: scale-down 0.4s ease-in;
}
::view-transition-new(hero-image) {
  animation: scale-up 0.4s ease-out;
}
```

### Next.js unstable_ViewTransition

```typescript
import { unstable_ViewTransition as ViewTransition } from 'react'

function PageLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <ViewTransition>
      <Link href={href}>{children}</Link>
    </ViewTransition>
  )
}
```

**注意**: View Transitions API はエフェクトレベル非依存。ブラウザ未対応時は通常の遷移にフォールバック。

## next.config.ts optimizePackageImports

```typescript
experimental: {
  optimizePackageImports: [
    'gsap', 'gsap/ScrollTrigger', '@gsap/react', 'lenis',
    'three', '@react-three/fiber', '@react-three/drei',
    'pixi.js',
    'detect-gpu',
  ],
}
```

## レスポンシブ対応とモバイル戦略

### ブレークポイント統一規約

| コンテキスト            | ブレークポイント | 備考                 |
| ----------------------- | ---------------- | -------------------- |
| Tailwind CSS            | `md: 768px`      | CSS レイアウト用     |
| `gsap.matchMedia()`     | `800px`          | アニメーション分岐用 |
| `detect-gpu` `isMobile` | UA + 画面サイズ  | 自動判定             |

### モバイルでのエフェクトレベル制限

```
デスクトップ tier 3 → L4（全エフェクト有効）
モバイル   tier 3 → L3（-1ペナルティ、PixiJS無効）
モバイル   tier 2 → L1（-1ペナルティ、CSSのみ）
モバイル   tier 1 → L1（最低レベル）
```

### モバイルでの各レベル挙動

| レベル | モバイルでの挙動                                                  |
| ------ | ----------------------------------------------------------------- |
| L1     | CSS transition のみ。パララックスなし                             |
| L2     | GSAP パララックス量50%削減、ピン固定回避、Lenis `syncTouch: true` |
| L3     | Three.js DPR制限（1.5）、パーティクル数40%、ジオメトリ簡略化      |
| L4     | **モバイルでは到達不可**（isMobile ペナルティにより）             |

### ビューポート単位規約

```css
/* モバイルアドレスバー対応 */
height: 100svh; /* ✅ small viewport height（推奨） */
height: 100dvh; /* ⚠️ dynamic（アドレスバー連動でリフロー） */
height: 100vh; /* ❌ 固定（モバイルで下部が隠れる） */
min-height: 100svh; /* ✅ min-height で安全に使用 */
```

### Lenis モバイル設定ガイドライン

| パラメータ        | デスクトップ | モバイル | 理由                     |
| ----------------- | ------------ | -------- | ------------------------ |
| `lerp`            | 0.08         | 0.12     | タッチ慣性を軽減         |
| `duration`        | 1.4          | 1.0      | 短いスクロール距離に適応 |
| `syncTouch`       | false        | true     | iOS ゴムバンド効果と共存 |
| `touchMultiplier` | -            | 2.0      | タッチ感度調整           |

### タッチ vs ホバー

```css
/* ホバーエフェクトはホバー可能デバイスのみ */
@media (hover: hover) {
  .interactive:hover {
    transform: scale(1.05);
  }
}

/* タッチデバイスではタップフィードバック */
@media (hover: none) {
  .interactive:active {
    transform: scale(0.97);
  }
}
```

```typescript
// Three.js / PixiJS のマウスインタラクション
const hasHover = window.matchMedia("(hover: hover)").matches;
// hasHover === false の場合、ホバーエフェクトを無効化
```

## Web Vitals CLS 防止パターン

### CLS 防止パターン

```typescript
// NG: サイズ未定義（CLS発生）
<section ref={sectionRef}>
  <img src="/hero.webp" alt="" />
</section>

// OK: 初期サイズ確保（CLSゼロ）
<section ref={sectionRef} className="min-h-svh">
  <img
    src="/hero.webp"
    alt=""
    width={1920}
    height={1080}
    className="aspect-video w-full object-cover"
    fetchPriority="high"  // LCP対策: Hero画像
  />
</section>
```

### CLS を引き起こすパターン

| パターン                   | CLS影響 | 対策                                      |
| -------------------------- | ------- | ----------------------------------------- |
| 画像サイズ未指定           | 高      | `width`/`height` 属性 or `aspect-ratio`   |
| フォントロード後のリフロー | 中      | `font-display: swap` + `size-adjust`      |
| ScrollTrigger `pin: true`  | 中      | `pinSpacing: true`（デフォルト）を維持    |
| 動的コンテンツ挿入         | 高      | `min-height` でスペース確保               |
| Three.js Canvas サイズ変更 | 低      | CSS で `width: 100%; height: 100svh` 固定 |

## パフォーマンス監視（本番）

```typescript
"use client";

import { useEffect } from "react";

export function WebVitalsReporter() {
  useEffect(() => {
    // web-vitals ライブラリ（動的インポート）
    import("web-vitals").then(({ onCLS, onFID, onLCP, onINP }) => {
      const report = (metric: { name: string; value: number }) => {
        // Analytics送信（Google Analytics, Vercel Analytics等）
        console.debug(`[WebVitals] ${metric.name}: ${metric.value}`);
      };
      onCLS(report);
      onFID(report);
      onLCP(report);
      onINP(report);
    });
  }, []);

  return null;
}
```

### FPS 監視（開発 + 本番）

```typescript
function useFpsMonitor(onDegrade: (fps: number) => void) {
  useEffect(() => {
    const samples: number[] = [];
    let lastTime = performance.now();
    let frameId: number;

    const tick = () => {
      const now = performance.now();
      const fps = 1000 / (now - lastTime);
      lastTime = now;
      samples.push(fps);

      if (samples.length >= 60) {
        const avg = samples.reduce((a, b) => a + b) / samples.length;
        if (avg < 30) {
          onDegrade(avg); // 30fps未満 → degradeTo 呼び出し
        }
        samples.length = 0;
      }

      frameId = requestAnimationFrame(tick);
    };

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [onDegrade]);
}
```

## ui-ux-pro-max エフェクトレベル連携

`ui-ux-pro-max` スタイルデータベースの各スタイルが要求するエフェクトレベルの対応表。
デザイン方針決定時にスタイル選択とデバイス対応範囲を同時に検討するために使用。

### スタイル → エフェクトレベル要件

| ui-ux-pro-max スタイル     | 最低L | 推奨L | パフォーマンス評価 | 使用技術                          |
| -------------------------- | ----- | ----- | ------------------ | --------------------------------- |
| Minimalism (1)             | L1    | L1    | Excellent          | CSS transition のみ               |
| Flat Design (12)           | L1    | L1    | Excellent          | CSS hover, opacity                |
| Glassmorphism (3)          | L1    | L2    | Good               | backdrop-filter + GSAP            |
| Motion-Driven (15)         | L2    | L2-L3 | Good               | GSAP ScrollTrigger + Lenis        |
| Kinetic Typography (48)    | L2    | L2    | Moderate           | GSAP SplitText + scrub            |
| Parallax Storytelling (49) | L2    | L2-L3 | Poor               | GSAP pin + scrub + stacking       |
| Dimensional Layering (46)  | L2    | L2    | Good               | GSAP translateZ + z-index         |
| Hero-Centric Design (20)   | L1    | L2    | Good               | GSAP parallax + fade              |
| Storytelling-Driven (27)   | L2    | L2-L3 | Moderate           | GSAP scroll reveals + transitions |
| 3D & Hyperrealism (5)      | L3    | L3-L4 | Poor               | Three.js / R3F + WebGL            |
| Spatial UI / VisionOS (55) | L3    | L3    | Moderate           | Three.js + parallax depth         |
| Liquid Glass (14)          | L2    | L4    | Moderate-Poor      | GSAP + PixiJS blur/grain          |
| Cyberpunk UI (41)          | L2    | L3-L4 | Moderate           | GSAP glitch + PixiJS scanlines    |

### プロダクトタイプ別推奨エフェクト

```bash
# レンタルスペース/ホスピタリティ向け検索
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "hospitality rental space" --domain product
```

| プロダクトタイプ | 推奨スタイル                 | 推奨L | 理由                         |
| ---------------- | ---------------------------- | ----- | ---------------------------- |
| レンタルスペース | Motion-Driven + Hero-Centric | L2    | 写真重視、スクロール自然体験 |
| 高級ホテル       | Liquid Glass + Storytelling  | L2-L3 | 没入感、ブランド体験         |
| 建築事務所       | Parallax Storytelling + 3D   | L2-L3 | 空間表現、作品ショーケース   |
| 不動産           | Hero-Centric + Dimensional   | L2    | 信頼感、物件ビジュアル       |
| イベント会場     | Motion-Driven + Horizontal   | L2    | エネルギー、スクロール体験   |

### デグラデーション戦略

ui-ux-pro-max のスタイル選択時、対象ユーザーのデバイス分布を考慮:

```
L4（PixiJS）→ L3（Three.js フォールバック）→ L2（GSAP フォールバック）→ L1（CSS フォールバック）
     ↑                    ↑                        ↑                       ↑
  Liquid Glass       3D & Hyper          Motion-Driven / Storytelling    Minimalism
  Cyberpunk          Spatial UI          Kinetic Typography              Flat Design
```

各レベルのフォールバックが視覚的に破綻しないことを確認:

- L4 → L3: PixiJS フィルター → CSS radial-gradient + noise texture
- L3 → L2: Three.js 3D → CSS gradient + GSAP transform
- L2 → L1: GSAP ScrollTrigger → CSS `animation-timeline: scroll()` or 静的表示
- L1: CSS transition + `prefers-reduced-motion` 対応

→ 各レベルのフォールバックパターンは `.claude/rules/gsap-patterns.md`、`.claude/rules/threejs-patterns.md`、`.claude/rules/pixijs-patterns.md` を参照

## クロスレベルオーケストレーション

### アーキテクチャ: base L2 → Enhanced L3 → Filter L4

```
Hero セクション構成例:
┌─────────────────────────────────────┐
│ z-index: 0  | 背景グラデーション (CSS)    │
│ z-index: 2  | Three.js Canvas (L3)     │  ← ParticleField + FloatingGeometry
│ z-index: 3  | PixiJS Canvas (L4)       │  ← Grain + Vignette
│ z-index: 5  | 装飾アクセント (CSS)       │
│ z-index: 10 | コンテンツ (HTML)          │  ← テキスト、CTA
│ z-index: 20 | スクロールインジケーター    │
└─────────────────────────────────────┘
```

### タイミング協調: L2 GSAP → L3 Three.js 順序

```typescript
// 1. GSAP アニメーション開始（DOM要素のパララックス）
useGSAP(
  () => {
    gsap.fromTo(
      ".hero-title",
      { opacity: 0, y: 50 },
      {
        opacity: 1,
        y: 0,
        duration: 1,
        ease: "power3.out",
        scrollTrigger: { trigger: ".hero", start: "top 80%" },
      },
    );
  },
  { scope: sectionRef },
);

// 2. Three.js は同じスクロールデータを参照してリアクティブに動作
function ParticlesWithScroll() {
  const scrollRef = useScrollRef();
  useFrame(() => {
    // scrollRef.current.progress が GSAP と同じ Lenis から供給される
    const intensity = scrollRef.current.progress * 0.5;
    // パーティクルの広がりをスクロールに連動
  });
}
```

### 共有スクロールデータフロー

```typescript
// SmoothScrollProvider が Lenis インスタンスを直接管理し、
// lenis/react の LenisContext を提供。
// 消費側は useLenis() from 'lenis/react' でアクセス。

interface ScrollState {
  scroll: number      // 現在のスクロール位置
  limit: number       // 最大スクロール量
  velocity: number    // スクロール速度
  progress: number    // 0-1 の進行率
  direction: -1 | 0 | 1
  isScrolling: boolean
}

// L2: Provider 内部で lenis.on('scroll', ScrollTrigger.update) を直接呼び出し
// L3: useLenis(callback) → mutable ref → useFrame 内で参照（useScrollUniforms）
// L4: useLenis(callback) → mutable ref → PixiJS ticker 内で参照（usePixiScroll）

// 消費側の例:
import { useLenis } from 'lenis/react'
useLenis((lenis) => {
  ref.current = { scroll: lenis.scroll, progress: lenis.progress, ... }
})
```

### イベントバス（GSAP callbacks → Three.js state）

```typescript
// GSAP のコールバックで Three.js の状態を更新
const threeStateRef = useRef({ sectionActive: false, intensity: 0 });

ScrollTrigger.create({
  trigger: ".hero",
  start: "top top",
  end: "bottom top",
  onEnter: () => {
    threeStateRef.current.sectionActive = true;
  },
  onLeave: () => {
    threeStateRef.current.sectionActive = false;
  },
  onUpdate: (self) => {
    threeStateRef.current.intensity = self.progress;
  },
});

// Three.js 側で参照
function ResponsiveParticles() {
  useFrame(() => {
    if (!threeStateRef.current.sectionActive) return;
    const intensity = threeStateRef.current.intensity;
    // intensity に基づいてパーティクル動作を変更
  });
}
```

## レベル遷移アニメーション

### デグラデーション時のビジュアル: 3D fadeout → 2D takeover

```typescript
// Three.js Canvas のフェードアウト
function ThreeCanvasWithDegradation() {
  const { effectLevel } = useVisualEffects()
  const [opacity, setOpacity] = useState(1)

  useEffect(() => {
    if (effectLevel < 3) {
      // 0.5秒かけてフェードアウト
      gsap.to({ value: 1 }, {
        value: 0,
        duration: 0.5,
        onUpdate: function() { setOpacity(this.targets()[0].value) },
        onComplete: () => { /* Canvas を完全に非表示 */ },
      })
    }
  }, [effectLevel])

  return (
    <div style={{ opacity }} className="absolute inset-0 z-[2]">
      <Canvas>{/* ... */}</Canvas>
    </div>
  )
}
```

### CSS opacity crossfade on canvas container

```css
.canvas-container {
  transition: opacity 0.5s ease-out;
}
.canvas-container[data-degraded="true"] {
  opacity: 0;
  pointer-events: none;
}
```

### 視覚的連続性の維持（ジャンプ防止）

- L3 → L2 遷移時: Three.js パーティクルの色に合わせた CSS radial-gradient を事前に背景に配置
- L4 → L3 遷移時: PixiJS フィルターの最終レンダリングに近い CSS filter を事前定義
- 遷移は `opacity` crossfade で 0.3-0.5s かけて実行

## ビジュアルエフェクトテスト戦略

### Playwright スクリーンショット比較（visual regression）

```typescript
import { test, expect } from "@playwright/test";

test("Hero section visual regression", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(2000); // アニメーション完了待ち

  // スクリーンショット比較（閾値設定）
  await expect(page.locator(".hero-section")).toHaveScreenshot(
    "hero-desktop.png",
    {
      maxDiffPixelRatio: 0.02, // 2% まで許容（アニメーション揺らぎ）
      animations: "disabled", // CSS animation を停止
    },
  );
});

test("Hero section mobile", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await page.goto("/");
  await page.waitForTimeout(2000);

  await expect(page.locator(".hero-section")).toHaveScreenshot(
    "hero-mobile.png",
    {
      maxDiffPixelRatio: 0.02,
    },
  );
});
```

### FPS 閾値アサーション（performance benchmark）

```typescript
test("Scroll performance meets 60fps target", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");

  // Performance Observer でフレームレートを計測
  const fps = await page.evaluate(() => {
    return new Promise<number>((resolve) => {
      const frames: number[] = [];
      let lastTime = performance.now();

      function measure() {
        const now = performance.now();
        frames.push(1000 / (now - lastTime));
        lastTime = now;
        if (frames.length >= 60) {
          resolve(frames.reduce((a, b) => a + b) / frames.length);
        } else {
          requestAnimationFrame(measure);
        }
      }

      requestAnimationFrame(measure);
      // スクロールをシミュレート
      window.scrollTo({
        top: document.body.scrollHeight / 2,
        behavior: "smooth",
      });
    });
  });

  expect(fps).toBeGreaterThan(45); // 最低45fps
});
```

### GPU tier オーバーライド（detect-gpu override でレベル別テスト）

```typescript
test.describe("Effect level tests", () => {
  test("L1: CSS only (reduced motion)", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    // L1 フォールバックが正しく表示されることを確認
    await expect(page.locator(".three-canvas")).not.toBeVisible();
    await expect(page.locator(".pixi-canvas")).not.toBeVisible();
  });

  test("L2: GSAP animations visible", async ({ page }) => {
    await page.goto("/");
    // GSAP アニメーション要素が表示されることを確認
    await page.waitForSelector(".gsap-animated.is-visible");
  });
});
```

### prefers-reduced-motion 検証

```typescript
test("Respects prefers-reduced-motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");

  // アニメーション関連の transform/opacity が初期値であることを確認
  const opacity = await page
    .locator(".hero-title")
    .evaluate((el) => getComputedStyle(el).opacity);
  expect(opacity).toBe("1"); // 非表示状態ではなく即座に表示
});
```

### モバイルデバイステストチェックリスト

| 確認項目         | テスト方法              | 合格基準              |
| ---------------- | ----------------------- | --------------------- |
| パララックス量   | DevTools モバイルビュー | デスクトップの50%以下 |
| pin固定なし      | iOS Safari実機          | スクロールがスムーズ  |
| Three.js DPR     | GPU tier override       | ≤ 1.5                 |
| タッチスクロール | 実機タッチ              | Lenis syncTouch 有効  |
| CLS              | Lighthouse              | < 0.1                 |
| LCP              | Lighthouse              | < 2.5s                |
| 60fps            | Performance Monitor     | > 45fps               |

## セクション間アニメーションシーケンシング

### セクション入場/退場の協調

```typescript
// セクションごとに入場/退場アニメーションを定義
function setupSectionTransitions(sections: HTMLElement[]) {
  sections.forEach((section, i) => {
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: section,
        start: "top 80%",
        end: "bottom 20%",
        scrub: false,
        toggleActions: "play reverse play reverse",
      },
    });

    // 入場
    tl.fromTo(
      section.querySelectorAll(".animate-in"),
      { opacity: 0, y: 40 },
      { opacity: 1, y: 0, stagger: 0.1, duration: 0.8, ease: "power2.out" },
    );
  });
}
```

### スクロール進行オーバーラップゾーン

隣接セクション間の遷移をスムーズにするため、20%のオーバーラップゾーンを設定:

```typescript
sections.forEach((section, i) => {
  // 退場: セクション下端の80-100%で退場
  ScrollTrigger.create({
    trigger: section,
    start: "80% center",
    end: "bottom center",
    scrub: true,
    onUpdate: (self) => {
      gsap.set(section, { opacity: 1 - self.progress * 0.3 });
    },
  });

  // 入場: 次のセクションが0-20%で入場
  if (i < sections.length - 1) {
    const next = sections[i + 1];
    ScrollTrigger.create({
      trigger: next,
      start: "top bottom",
      end: "20% center",
      scrub: true,
      onUpdate: (self) => {
        gsap.set(next, { opacity: 0.3 + self.progress * 0.7 });
      },
    });
  }
});
```

### 隣接セクション間カラー/ムード遷移

```typescript
const SECTION_THEMES = [
  { bg: "oklch(0.15 0.02 250)", text: "oklch(0.95 0 0)" }, // ダーク
  { bg: "oklch(0.97 0.01 80)", text: "oklch(0.15 0.02 250)" }, // ライト
  { bg: "oklch(0.20 0.05 300)", text: "oklch(0.90 0.03 60)" }, // パープル
];

sections.forEach((section, i) => {
  if (i >= SECTION_THEMES.length - 1) return;
  const from = SECTION_THEMES[i];
  const to = SECTION_THEMES[i + 1];

  ScrollTrigger.create({
    trigger: section,
    start: "70% center",
    end: "bottom center",
    scrub: true,
    onUpdate: (self) => {
      // OKLCH 値をスクロール進行で補間
      const p = self.progress;
      document.body.style.setProperty(
        "--section-bg",
        interpolateOklch(from.bg, to.bg, p),
      );
      document.body.style.setProperty(
        "--section-text",
        interpolateOklch(from.text, to.text, p),
      );
    },
  });
});
```

### ページ全体でのアニメーション言語統一

| 要素             | 統一ルール                               |
| ---------------- | ---------------------------------------- |
| 入場方向         | 全セクション共通（下から上 or 左から右） |
| イージング       | 入場: `.out` 系、退場: `.in` 系で統一    |
| stagger          | 同種要素は同じ stagger 値                |
| duration         | 基本 0.6-0.8s、強調 1.0-1.2s             |
| パララックス方向 | 背景: 遅い（正のy）、前景: 速い（負のy） |
| カラー遷移       | 隣接セクション間でスムーズ補間           |

---
paths:
  - src/app/(public*)/**
---

# ビジュアルエフェクトアーキテクチャ

> エフェクトレベル L1-L4 / パフォーマンスバジェット / GPU検出 / WebGLコンテキスト管理

## 概要

公開ページのビジュアルエフェクトは4段階のレベルシステムで管理。
デバイスのGPU能力に応じて自動的にエフェクトレベルを決定し、パフォーマンスを保証する。

> **詳細リファレンス**: `docs/reference/claude-rules/visual-effects-reference.md`

## エフェクトレベル定義

| レベル | 技術 | 対象デバイス | 内容 |
|--------|------|-------------|------|
| L1 | CSS only | 低性能 / `prefers-reduced-motion` | CSS transition, @keyframes, SVG animation, scroll-driven animation, backdrop-filter, mix-blend-mode |
| L2 | GSAP + Lenis | 中性能 | ScrollTrigger, スムーススクロール, パララックス |
| L3 | Three.js (R3F) | 高性能 | 3D パーティクル, 浮遊ジオメトリ, WebGL |
| L4 | PixiJS v8 | 最高性能（デスクトップ専用GPU） | 2D GLSLフィルター, グレイン, ビネット, スプライト |

## パフォーマンスバジェット

```typescript
export const PERFORMANCE_BUDGETS: Record<EffectLevel, PerformanceBudget> = {
  1: { targetFps: 30, maxWebGLContexts: 0, allowThreeJs: false, allowPixiJs: false },
  2: { targetFps: 45, maxWebGLContexts: 0, allowThreeJs: false, allowPixiJs: false },
  3: { targetFps: 60, maxWebGLContexts: 4, allowThreeJs: true,  allowPixiJs: false },
  4: { targetFps: 60, maxWebGLContexts: 8, allowThreeJs: true,  allowPixiJs: true  },
}
```

## GPU検出フロー

```
detect-gpu（ベンチマーク）→ gpuTier (0-3) → effectLevel 変換
  - FALLBACK/tier 0 → WebGL直接検出フォールバック
  - desktop tier 3 → L4
  - mobile tier N → L(N-1)（1段階ペナルティ）
  - prefersReducedMotion → 常にL1
```

### DeviceCapabilities 型

```typescript
interface DeviceCapabilities {
  readonly gpuTier: 0 | 1 | 2 | 3
  readonly isMobile: boolean
  readonly prefersReducedMotion: boolean
  readonly effectLevel: EffectLevel
  readonly gpuModel: string | null
  readonly estimatedFps: number | null
}
```

## VisualEffectsProvider hook インターフェース

```typescript
const { effectLevel, budget, capabilities, degradeTo } = useVisualEffects()

// L3以上でThree.js有効
if (effectLevel >= 3 && budget.allowThreeJs) { /* ThreeCanvas描画 */ }

// ダウングレードのみ許可
degradeTo(toEffectLevel(effectLevel - 1))
```

> **VisualEffectsProvider完全実装**: → `docs/reference/claude-rules/visual-effects-reference.md`

## WebGLコンテキストLRU管理

```typescript
import { webGLContextManager } from '../core/webgl-context-manager'
webGLContextManager.register({ id, canvas, type: 'three', createdAt: Date.now() })
webGLContextManager.unregister(id)
```

## Z-index ベースライン

| z-index | 用途 |
|---------|------|
| 0 | 背景レイヤー |
| 2 | Three.js Canvas |
| 3 | PixiJS Canvas |
| 5 | 装飾アクセント |
| 10 | コンテンツ（テキスト、ボタン） |
| 20 | スクロールインジケーター |

## ゼロコピースクロールパターン

Three.js / PixiJS は React state を使わず mutable ref でスクロール値を管理（再レンダリングゼロ）。

```typescript
interface ScrollState {
  readonly scroll: number
  readonly limit: number
  readonly velocity: number
  readonly progress: number
  readonly direction: -1 | 0 | 1
  readonly isScrolling: boolean
}
```

## エフェクトレベル判定ロジック

```typescript
function determineEffectLevel(gpuTier, isMobile, prefersReducedMotion): EffectLevel {
  if (prefersReducedMotion) return 1
  if (gpuTier.type !== 'BENCHMARK' || gpuTier.tier === 0) return detectFromWebGL()
  if (isMobile) return toEffectLevel(Math.max(1, gpuTier.tier - 1))
  if (gpuTier.tier === 3) return 4
  return toEffectLevel(gpuTier.tier)
}
```

## レスポンシブ戦略

| コンテキスト | ブレークポイント | 備考 |
|-------------|----------------|------|
| Tailwind CSS | `md: 768px` | CSS レイアウト用 |
| `gsap.matchMedia()` | `800px` | アニメーション分岐用 |
| `detect-gpu` | UA + 画面サイズ | 自動判定 |

### モバイルでの各レベル挙動

| レベル | モバイルでの挙動 |
|--------|----------------|
| L1 | CSS transition のみ。パララックスなし |
| L2 | GSAP パララックス量50%削減、ピン固定回避 |
| L3 | Three.js DPR制限（1.5）、パーティクル数40% |
| L4 | **モバイルでは到達不可** |

## Web Vitals 目標

| 指標 | 目標値 |
|------|--------|
| LCP | < 2.5s |
| FID | < 100ms |
| CLS | < 0.1 |
| INP | < 200ms |

## クロスレベルオーケストレーション要約

同一セクションで複数エフェクトレベルが共存する場合の階層構成:

```
Section
├── L2 Base: GSAP ScrollTrigger（パララックス、入場アニメーション）
├── L3 Enhanced: Three.js Canvas（パーティクル、3Dオブジェクト）
└── L4 Filter: PixiJS Canvas（Grain、Vignette、シェーダーフィルター）
```

**協調ルール**: L2 → L3 → L4 の順に初期化。スクロールデータは `ScrollState` ref を共有。各レベルは独立して無効化可能（グレースフルデグラデーション）。

```typescript
// 共有スクロールデータフロー（Lenis 公式推奨 GSAP 統合パターン）
// GSAP ticker → lenis.raf() → scroll イベント発火 → 全レベルに伝播
GSAP ticker → lenis.raf(time * 1000) → SmoothScrollProvider (LenisContext.Provider)
  → GSAP ScrollTrigger.update (L2) ← lenis.on('scroll', ScrollTrigger.update)
  → useLenis(callback) → ScrollState ref → useFrame (L3 Three.js)
  → useLenis(callback) → ScrollState ref → ticker (L4 PixiJS)

// 消費側は lenis/react の useLenis() を使用
import { useLenis } from 'lenis/react'
```

**注意**: `gsap.config({ autoSleep: 0 })` で ticker スリープを防止。デフォルトでは ~2秒のアイドル後に ticker が停止し、Lenis の scroll 処理がデッドロックする。

> **詳細（タイミング協調、イベントバス、全レベル同時実装例）**: → `docs/reference/claude-rules/visual-effects-reference.md` §クロスレベルオーケストレーション

## グレースフルデグラデーション要約

各レベルでのユーザー体験保証:

| デグラデーション | ビジュアル変化 | ユーザー体験 |
|---------------|-------------|------------|
| L4 → L3 | PixiJS フィルター消失 → CSS `radial-gradient` + noise texture | 微量な質感低下、機能影響なし |
| L3 → L2 | Three.js Canvas 非表示 → CSS gradient + GSAP transform | 3Dエフェクト消失、レイアウト維持 |
| L2 → L1 | GSAP 無効化 → CSS `animation-timeline: scroll()` or 静的 | アニメーション簡略化、コンテンツ完全アクセス可 |
| L1 (minimum) | CSS transition + `prefers-reduced-motion` 対応 | 全コンテンツアクセス可能 |

**要件**: L3/L4エフェクトは必ずL2/L1フォールバックを用意。視覚的な「ジャンプ」を防ぐため、CSS opacity crossfade でデグラデーション時のトランジションを提供。

> **詳細（トランジションアニメーション、テスト戦略）**: → `docs/reference/claude-rules/visual-effects-reference.md` §レベル遷移アニメーション

## 禁止事項

1. **GPU検出スキップ禁止** — `VisualEffectsProvider` なしでThree.js/PixiJSを使用しない
2. **effectLevel昇格禁止** — `degradeTo` はダウングレードのみ
3. **React stateでスクロールデータ管理禁止** — mutable ref パターン使用
4. **WebGLコンテキスト登録漏れ禁止** — 必ず `webGLContextManager` に登録/解除
5. **同期的なGPU検出禁止** — `detectDeviceCapabilities()` は非同期
6. **reduced-motion 対応無視禁止** — → `gsap-patterns.md` §reduced-motion 対応（パターン A/B/C）
7. **VisualEffectsProvider外でのeffectLevel直接ハードコード禁止**
8. **サーバーコンポーネントでのeffectLevel参照禁止** — `'use client'` 必須
9. **WebGLコンテキスト数超過の放置禁止** — IntersectionObserver で管理
10. **フォールバック未定義の高レベルエフェクト禁止** — L3/L4は必ずL2/L1フォールバックを用意

## ファイル配置

| パス | 内容 |
|------|------|
| `effects/core/types.ts` | EffectLevel, DeviceCapabilities, ScrollState, PerformanceBudget 型 |
| `effects/core/device-capabilities.ts` | GPU検出ロジック |
| `effects/core/webgl-context-manager.ts` | WebGLコンテキストLRU管理 |
| `effects/core/VisualEffectsProvider.tsx` | エフェクトレベルProvider |
| `effects/three/` | Three.js / R3F コンポーネント |
| `effects/pixi/` | PixiJS v8 コンポーネント |

> **詳細パターン（VisualEffectsProvider完全実装、detect-gpu API詳細、ブレンドモード、カスタムカーソル、Lottie、CSS scroll-driven、CSSエフェクトカタログ12種、View Transitions API、FPSモニター、WebVitalsReporter、ui-ux-pro-maxマッピング）**: → `docs/reference/claude-rules/visual-effects-reference.md`

---
paths:
  - src/app/(public*)/**
---

# ビジュアルエフェクトアーキテクチャ

> Codex 用参照ドキュメント。公開ページの effect level と WebGL 管理はこのファイルを正本とする。
> エフェクトレベル L1-L4 / パフォーマンスバジェット / GPU検出 / WebGLコンテキスト管理

## 概要

公開ページのビジュアルエフェクトは4段階のレベルシステムで管理。
デバイスのGPU能力に応じて自動的にエフェクトレベルを決定し、パフォーマンスを保証する。

> 実装詳細は `src/app/(public)/_shared/components/effects/` を参照。

## エフェクトレベル定義

| レベル | 技術 | 対象デバイス | 内容 |
|--------|------|-------------|------|
| L1 | CSS only | 低性能 / `prefers-reduced-motion` | CSS transition, @keyframes, SVG animation, scroll-driven animation, backdrop-filter, mix-blend-mode |
| L2 | GSAP + Lenis | 中性能 | ScrollTrigger, スムーススクロール, パララックス |
| L3 | Three.js (R3F) | 高性能 | 3D パーティクル, 浮遊ジオメトリ, WebGL |
| L4 | PixiJS v8 | 最高性能（デスクトップ専用GPU） | 2D GLSLフィルター, グレイン, ビネット, スプライト |

## パフォーマンスバジェット

```typescript
// src/app/(public)/_shared/components/effects/core/types.ts
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
  - FALLBACK / tier 0 → WebGL直接検出フォールバック（専用GPU検出で最大tier 3まで補正）
  - desktop tier 3 → L4（PixiJS有効）
  - desktop tier 0-1 → L1（toEffectLevel は n<=1 をL1に丸める）
  - desktop tier 2 → L2
  - mobile tier N → L(N-1)（1段階ペナルティ）
  - prefersReducedMotion → 常にL1（GPU検出前に即座に返す）
```

### GPU検出の実際のロジック

```typescript
// device-capabilities.ts
const baseLevel = gpuTier === 3 && !isMobile ? 4 : gpuTier
const rawLevel = toEffectLevel(baseLevel)
const effectLevel = isMobile && rawLevel > 1
  ? toEffectLevel(baseLevel - 1)
  : rawLevel
```

**注意**: デスクトップ tier 3 のみが L4 に到達する。tier 2 → L2、tier 1 → L1。

### WebGL直接検出フォールバック

detect-gpu がベンチマーク失敗（type: "FALLBACK"）または tier 0 の場合:
- WebGL2 + 専用GPU（NVIDIA/Radeon/GeForce/RTX/GTX キーワード） → tier 3
- WebGL2 → tier 2
- WebGL1 のみ → tier 1
- WebGL なし → tier 0

### DeviceCapabilities 型

```typescript
// src/app/(public)/_shared/components/effects/core/types.ts
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
// src/app/(public)/_shared/components/effects/core/VisualEffectsProvider.tsx
const { effectLevel, budget, capabilities, isReady, degradeTo } = useVisualEffects()

// L3以上でThree.js有効
if (effectLevel >= 3 && budget.allowThreeJs) { /* ThreeCanvas描画 */ }

// ダウングレードのみ許可（Math.min でガード）
degradeTo(toEffectLevel(effectLevel - 1))

// Provider外でも安全に使いたい場合
const ctx = useVisualEffectsOptional()  // null | VisualEffectsContextValue
```

> **VisualEffectsProvider 実装**: `src/app/(public)/_shared/components/effects/core/VisualEffectsProvider.tsx`

## prefers-reduced-motion の動的監視

`VisualEffectsProvider` は `MediaQueryList.addEventListener('change', ...)` で OS 設定変更をリアルタイム監視。
設定変更時に即座に `effectLevel = 1` へ強制ダウングレード。GPU 検出完了後も動的に反応する。

## WebGLコンテキストLRU管理

```typescript
// src/app/(public)/_shared/components/effects/core/webgl-context-manager.ts
import { webGLContextManager } from '../core/webgl-context-manager'

webGLContextManager.register({ id, canvas, type: 'three', createdAt: Date.now() })
webGLContextManager.unregister(id)
```

`type` は `'three' | 'pixi' | 'raw'`。maxWebGLContexts（budget）を超えた場合に最古コンテキストをLRU削除。

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
// types.ts の ScrollState 型
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
// device-capabilities.ts（実際の実装）
async function detectDeviceCapabilities(): Promise<DeviceCapabilities> {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (prefersReducedMotion) return { ..., effectLevel: 1 }

  // detect-gpu ベンチマーク → 失敗時はWebGL直接検出にフォールバック
  // ...

  // デスクトップ tier 3 → L4。モバイルは1段階下げ
  const baseLevel = gpuTier === 3 && !isMobile ? 4 : gpuTier
  const rawLevel = toEffectLevel(baseLevel)
  const effectLevel = isMobile && rawLevel > 1
    ? toEffectLevel(baseLevel - 1)
    : rawLevel

  return { gpuTier, isMobile, prefersReducedMotion: false, effectLevel, gpuModel, estimatedFps }
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
| L4 | **モバイルでは到達不可**（isMobile ペナルティで最高 L3） |

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

> **実装参照**: `src/app/(public)/_shared/components/effects/core/ScrollOrchestrator.tsx` と `src/app/(public)/_shared/components/effects/`

## グレースフルデグラデーション要約

各レベルでのユーザー体験保証:

| デグラデーション | ビジュアル変化 | ユーザー体験 |
|---------------|-------------|------------|
| L4 → L3 | PixiJS フィルター消失 → CSS `radial-gradient` + noise texture | 微量な質感低下、機能影響なし |
| L3 → L2 | Three.js Canvas 非表示 → CSS gradient + GSAP transform | 3Dエフェクト消失、レイアウト維持 |
| L2 → L1 | GSAP 無効化 → CSS `animation-timeline: scroll()` or 静的 | アニメーション簡略化、コンテンツ完全アクセス可 |
| L1 (minimum) | CSS transition + `prefers-reduced-motion` 対応 | 全コンテンツアクセス可能 |

**要件**: L3/L4エフェクトは必ずL2/L1フォールバックを用意。視覚的な「ジャンプ」を防ぐため、CSS opacity crossfade でデグラデーション時のトランジションを提供。

> **実装参照**: `src/app/(public)/_shared/components/effects/core/VisualEffectsProvider.tsx`

## 禁止事項

1. **GPU検出スキップ禁止** — `VisualEffectsProvider` なしでThree.js/PixiJSを使用しない
2. **effectLevel昇格禁止** — `degradeTo` はダウングレードのみ（`Math.min` でガード済み）
3. **React stateでスクロールデータ管理禁止** — mutable ref パターン使用
4. **WebGLコンテキスト登録漏れ禁止** — 必ず `webGLContextManager` に登録/解除
5. **同期的なGPU検出禁止** — `detectDeviceCapabilities()` は非同期
6. **reduced-motion 対応無視禁止** — → `gsap-patterns.md` §reduced-motion 対応（パターン A/B/C）
7. **VisualEffectsProvider外でのeffectLevel直接ハードコード禁止**
8. **サーバーコンポーネントでのeffectLevel参照禁止** — `'use client'` 必須
9. **WebGLコンテキスト数超過の放置禁止** — IntersectionObserver で管理
10. **フォールバック未定義の高レベルエフェクト禁止** — L3/L4は必ずL2/L1フォールバックを用意

```typescript
// NG: VisualEffectsProvider 外で直接 Three.js を使用
export function MyEffect() {
  return <Canvas><mesh /></Canvas>  // effectLevel チェックなし
}

// OK: useVisualEffects() で effectLevel を確認してから描画
export function MyEffect() {
  const { effectLevel } = useVisualEffects()
  if (effectLevel < 2) return null
  return <ThreeCanvas><mesh /></ThreeCanvas>
}
```

```typescript
// NG: effectLevel をアップグレード（degradeTo は昇格不可）
degradeTo(5)  // 現在が L3 でも L5 に昇格しようとする

// OK: ダウングレードのみ（内部で Math.min により昇格は無効）
degradeTo(2)  // L4 → L2 にダウングレード
```

## ファイル配置

パスは `src/app/(public)/_shared/components/` を起点とした相対パス。

| パス | 内容 |
|------|------|
| `effects/core/types.ts` | EffectLevel, DeviceCapabilities, ScrollState, PerformanceBudget 型、PERFORMANCE_BUDGETS定数、toEffectLevel |
| `effects/core/device-capabilities.ts` | GPU検出ロジック（detect-gpu + WebGL直接検出フォールバック） |
| `effects/core/webgl-context-manager.ts` | WebGLコンテキストLRU管理 |
| `effects/core/VisualEffectsProvider.tsx` | エフェクトレベルProvider + `useVisualEffects()` + `useVisualEffectsOptional()` |
| `effects/core/PerformanceMonitor.tsx` | FPS監視UI（開発ツール） |
| `effects/core/ScrollOrchestrator.tsx` | スクロールオーケストレーション |
| `effects/three/` | Three.js / R3F コンポーネント |
| `effects/pixi/` | PixiJS v8 コンポーネント |

> **詳細パターン**: `src/app/(public)/_shared/components/effects/` 以下の実装を優先して読む。

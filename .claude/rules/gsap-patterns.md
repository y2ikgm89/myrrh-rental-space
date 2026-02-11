---
paths:
  - src/app/(public*)/**
---

# GSAP パターンルール

> GSAP 3.14 / ScrollTrigger / @gsap/react / Lenis 1.3

## 概要

GSAP + ScrollTrigger によるスクロールアニメーション、Lenis によるスムーススクロール。
エフェクトレベル L2 以上で有効（→ `.claude/rules/visual-effects-patterns.md`）。

> **詳細リファレンス**: `docs/reference/claude-rules/gsap-reference.md`

## gsap-config.ts（中央設定）

```typescript
'use client'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useGSAP } from '@gsap/react'

gsap.registerPlugin(ScrollTrigger, useGSAP)
export { gsap, ScrollTrigger }

// @deprecated — 新規コードでは gsap.matchMedia() を使用。既存コードの互換用に残存。
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
```

**import元**: 常に `gsap-config.ts` から import。`gsap` や `gsap/ScrollTrigger` を直接 import しない。

## reduced-motion 対応（gsap.matchMedia — GSAP公式推奨）

[GSAP公式 Accessibility ガイド](https://gsap.com/resources/a11y) 推奨パターン。
`matchMedia` 内で作成されたアニメーション・ScrollTrigger は、条件不一致時に自動で **revert**（inline style 除去）される。OS設定の動的切替にもリアルタイム対応。

**レガシー `prefersReducedMotion()` との違い**:
- `prefersReducedMotion()`: 呼出時点のスナップショット。OS設定変更後にページリロードが必要
- `gsap.matchMedia()`: リアルタイム監視。条件変更時にアニメーション自動 revert / 再構築

### パターン A: useGSAP 内アニメーション（スクロール系・ロード系）

reduce 時は完全スキップ。ハンドラなし → GSAP 不介入 → 要素は CSS デフォルト（visible）のまま表示される。

```typescript
useGSAP(() => {
  const mm = gsap.matchMedia()
  mm.add('(prefers-reduced-motion: no-preference)', () => {
    gsap.fromTo(target, { opacity: 0, y: 50 }, {
      opacity: 1, y: 0, duration: 0.8,
      scrollTrigger: { trigger, start: 'top 85%' },
    })
  })
}, { scope: containerRef })
```

### パターン B: conditions 分岐（reduce でも軽量アニメーション実行）

常にアニメーション実行するが、reduce 時はパラメータを控えめにする場合:

```typescript
useGSAP(() => {
  const mm = gsap.matchMedia()
  mm.add({
    reduce: '(prefers-reduced-motion: reduce)',
    noPreference: '(prefers-reduced-motion: no-preference)',
  }, (ctx) => {
    const { reduce } = ctx.conditions ?? {}
    gsap.to(el, { y: reduce ? 4 : 8, repeat: -1, yoyo: true })
  })
}, { scope: ref })
```

### パターン C: イベントハンドラ用（useMotionPreference フック）

`useGSAP` の外（マウスイベント、クリック等）で motion 設定を参照する場合:

```typescript
import { useMotionPreference } from './_shared/hooks/use-motion-preference'

function MyComponent() {
  const motionOk = useMotionPreference()

  // useCallback 不要（React Compiler 自動メモ化、ref は依存配列と衝突する）
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!motionOk.current) return
    gsap.to(el, { x: delta * 0.3 })
  }
}
```

`useMotionPreference` フック実装（`_shared/hooks/use-motion-preference.ts`）:

```typescript
'use client'
import { useRef } from 'react'
import { useGSAP } from '@gsap/react'
import { gsap } from '../lib/gsap-config'

export function useMotionPreference(): React.RefObject<boolean> {
  const motionOk = useRef(true)
  useGSAP(() => {
    const mm = gsap.matchMedia()
    mm.add('(prefers-reduced-motion: reduce)', () => {
      motionOk.current = false
      return () => { motionOk.current = true }
    })
  })
  return motionOk
}
```

### パターン選択ガイド

| 状況 | パターン |
|------|---------|
| useGSAP 内（reduce 時は完全スキップ） | A |
| useGSAP 内（reduce / no-preference で異なるパラメータ） | B |
| イベントハンドラ内（mouseMove, click 等） | C |

## ScrollTrigger 3パターン要約

| パターン | 構成 | 用途 |
|---------|------|------|
| **入場アニメーション** | `toggleActions: 'play none none none'`, `start: 'top 75%'` | 要素がビューポートに入った時に1回再生 |
| **スクラブパララックス** | `scrub: true`, `start: 'top bottom'`, `end: 'bottom top'` | スクロール位置に連動する連続アニメーション |
| **ピン固定** | `pin: true`, `scrub: 1`, `invalidateOnRefresh: true` | 横スクロール、ステップ進行 |

**必須**: `pin: true` の場合は `invalidateOnRefresh: true` を設定。

## gsap.matchMedia レスポンシブ

```typescript
const mm = gsap.matchMedia()
mm.add({
  isDesktop: '(min-width: 800px)',
  isMobile: '(max-width: 799px)',
  noPreference: '(prefers-reduced-motion: no-preference)',
}, (ctx) => {
  const { isDesktop, noPreference } = ctx.conditions ?? {}
  if (!noPreference) return
  // デスクトップ/モバイルで異なるアニメーション
})
```

**ブレークポイント**: `800px`（Tailwind の `md: 768px` とは異なる）

**matchMedia の自動 revert**: `mm.add` 内で作成されたアニメーション・ScrollTrigger は、メディアクエリ条件が外れた時点で自動的に revert される。CSS の `!important` フォールバックは不要。

## Lenis + GSAP ticker 同期要約

`SmoothScrollProvider` が Lenis インスタンスを直接管理し、`lenis/react` の `LenisContext` を提供。
Lenis 公式推奨の GSAP 統合パターンを採用。消費側は `useLenis()` をそのまま使用可能。

```typescript
// SmoothScrollProvider 内部（Lenis 公式推奨パターン）
const lenis = new Lenis({ duration: 1.2 })           // autoRaf: false（デフォルト）
lenis.on('scroll', ScrollTrigger.update)              // ScrollTrigger との同期
const tickerCb = (time: number) => { lenis.raf(time * 1000) }
gsap.ticker.add(tickerCb)                             // GSAP ticker で Lenis RAF を駆動
gsap.ticker.lagSmoothing(0)                           // ラグ補正無効化
gsap.config({ autoSleep: 0 })                         // ticker スリープ防止
ScrollTrigger.refresh()                                // Lenis 初期化後に必須

// 動的コンテンツ対応: ResizeObserver で body の高さ変化を検知し自動 refresh
const ro = new ResizeObserver(() => { ScrollTrigger.refresh(true) })  // true = 安全モード
ro.observe(document.body)

// 消費側（ScrollOrchestrator, Three.js, PixiJS 等）
import { useLenis } from 'lenis/react'
const lenis = useLenis()                          // インスタンス取得
useLenis((lenis) => { /* scroll callback */ })     // スクロールイベント購読
```

**設計**:
- `autoRaf: false`（デフォルト）— GSAP ticker が Lenis の RAF を駆動。同一 RAF フレーム内で Lenis scroll 補間 → ScrollTrigger 更新 → GSAP tween 適用が実行され、フレーム同期が保証される。
- `autoSleep: 0` — GSAP ticker のスリープを無効化。デフォルト（120フレーム ~2秒）ではアイドル後に ticker が停止し、Lenis の `raf()` が呼ばれなくなりスクロールがデッドロックする。
- `ResizeObserver` — 遅延画像ロード・Suspense 解決・Cookie バナー出現等による高さ変化を自動検知。`refresh(true)` でスクロール完了後に安全にトリガー位置を再計算。
- `ReactLenis` コンポーネントは使用しない。`LenisContext` を直接提供し、`useLenis()` hook との互換性を維持。

## Tailwind CSS 4 と GSAP の transform 共存

**GSAP 公式: transform 関連の値は常に GSAP を通して設定すべき。**

Tailwind CSS 4 は個別 CSS プロパティ（`scale`, `rotate`, `translate`）を生成し、GSAP は `transform` プロパティに書き込む。別プロパティだが、同一要素に共存すると `clearProps` の不完全動作やマトリクス分解の汚染が発生する。

**ルール: GSAP がアニメーションする要素では Tailwind の transform クラス (`scale-*`, `rotate-*`, `translate-*`) を使わない。** `gsap.set()` で初期値を設定する。

```typescript
// OK: GSAP で transform を一元管理
gsap.set(bgRef.current, { scale: 1.1 })
gsap.fromTo(bgRef.current, { yPercent: 0 }, { yPercent: 30, scrub: true })

// OK: data 属性 + gsap.set() パターン（ループ内の一部要素のみ回転が必要な場合）
<div data-accent="" data-rotate="45" className="h-6 w-6 border ..." />
// GSAP 側:
const rotate = el.getAttribute('data-rotate')
if (rotate) gsap.set(el, { rotation: Number(rotate) })

// OK: GSAP が触らない要素は Tailwind transform クラスのまま
<Image className="scale-110" />  // ParallaxImage の子要素（GSAP 対象外）
```

## パフォーマンス必須事項

```typescript
gsap.set('.accelerated', { force3D: true })         // GPU acceleration
gsap.to('.hidden', { autoAlpha: 0 })                // visibility も制御
gsap.config({ force3D: true, autoSleep: 60 })       // グローバル設定
ScrollTrigger.refresh()                              // DOM変更後に必須
```

## レスポンシブ規約

| 機能 | デスクトップ | モバイル |
|------|------------|--------|
| パララックス量 | `yPercent: 30` | `yPercent: 12`（× 0.4に縮小） |
| ピン固定 | `pin: true` | **回避**（通常スクロール化） |
| 横スクロール | `pin: true + x` | **縦スクロールに変換** |
| 層数 | 5層 | 3層に簡略化 |
| stagger | `0.12` | `0.08`（短縮） |
| ビューポート単位 | `100svh` | `100svh`（`100vh` 禁止） |

## CLS対策

| CLS原因 | 対策 |
|---------|------|
| `pin: true` でレイアウトシフト | `pinSpacing: true`（デフォルト維持） |
| 画像読込前のレイアウト計算 | `width`/`height` 属性 + `aspect-ratio` |
| フォント読込後のリフロー | `font-display: swap` + `size-adjust` |
| GSAP 初期化前の生DOM表示 | `autoAlpha: 0` で初期非表示 |

## タイムラインオーケストレーション要約

| パターン | 構成 | 用途 |
|---------|------|------|
| **基本チェーン** | `tl.to().to().to()` | 順序付きアニメーション |
| **ラベル制御** | `tl.addLabel('mid').to(el, {}, 'mid')` | 任意タイミングに配置 |
| **ネスト** | `masterTl.add(sectionTl)` | セクション単位で分割管理 |
| **scrub連動** | `gsap.timeline({ scrollTrigger: { scrub: 1 } })` | スクロール進行でタイムライン制御 |

```typescript
const tl = gsap.timeline({
  scrollTrigger: { trigger: section, start: 'top top', end: 'bottom top', scrub: 1, pin: true },
})
tl.to('.layer-1', { yPercent: -30 })
  .to('.title', { opacity: 0, y: -50 }, '<')   // 同時実行
  .to('.layer-5', { yPercent: 50 }, '<0.1')     // 0.1秒遅延
```

> **詳細（制御API、ネスト設計、タイムスケール）**: → `docs/reference/claude-rules/gsap-reference.md` §タイムラインオーケストレーション

## ページ/セクション遷移要約

View Transitions API + GSAP による exit/enter アニメーション:

```typescript
async function navigateWithTransition(url: string) {
  if (!document.startViewTransition) { router.push(url); return }
  document.startViewTransition(async () => {
    await gsap.to('.page-content', { opacity: 0, y: -20, duration: 0.3 })
    router.push(url)
  })
}
```

**セクション間カラー遷移**: ScrollTrigger `onUpdate` で CSS変数 `--section-hue` を補間し、背景色を連続的に変化。

> **詳細（shared element, カラーモーフィング, セクション間協調）**: → `docs/reference/claude-rules/gsap-reference.md` §ページ/セクション遷移アニメーション

## デバッグ & トラブルシューティング要約

| ツール | 用途 |
|--------|------|
| `markers: true` | ScrollTrigger の start/end 位置を可視化 |
| `ScrollTrigger.getAll()` | 全ST インスタンスの一覧・状態確認 |
| `tl.progress()` / `tl.paused(true)` | タイムラインの進行状況確認・一時停止 |
| `gsap.globalTimeline.timeScale(0.2)` | 全アニメーションのスローモーション |

**よくある症状**:

| 症状 | 原因 | 対策 |
|------|------|------|
| ScrollTrigger 不発火 | scope未設定 / Lenis未初期化 | `useGSAP` + scope / Lenis readyを待機 |
| pin固定でジャンプ | 高速スクロール時の遅延 | `anticipatePin: 1` / `invalidateOnRefresh: true` |
| Lenisとの競合 | 複数スクロールインスタンス | 単一Lenisインスタンスに統一 |
| モバイルでpin破壊 | iOS Safari互換性 | `gsap.matchMedia()` でモバイルはpin回避 |
| SSRエラー | サーバーでwindow参照 | `'use client'` + `typeof window` チェック |

> **詳細（全症状テーブル、CLS対策、Lenis詳細設定）**: → `docs/reference/claude-rules/gsap-reference.md` §デバッグ & よくある落とし穴

## 禁止事項

1. **reduced-motion 対応省略禁止** — `gsap.matchMedia()` パターン A/B/C を使用（`prefersReducedMotion()` は非推奨）
2. **useGSAP 外での GSAP 使用禁止** — `useEffect` 内で直接 `gsap.to()` を呼ばない
3. **gsap/ScrollTrigger の直接 import 禁止** — `gsap-config.ts` 経由
4. **Math.random() 禁止** — 決定的ハッシュ関数使用（React Compiler互換）
5. **invalidateOnRefresh 省略禁止（pin使用時）**
6. **scrub パララックスにカスタム ease 禁止** — `scrub: true` ではデフォルトの `ease: 'none'`（リニア）を維持
7. **stagger の用途外使用に注意** — UI要素: `0.08~0.15`、テキスト行/語: `0.12~0.20`、テキスト文字(char): `0.02~0.06`、映画的: `0.3~0.5`
8. **markers の本番残存禁止**
9. **ScrollTrigger.refresh() 忘れ禁止** — DOM動的変更後は必須
10. **top/left アニメーション禁止** — `transform`, `opacity` を使用
11. **Canvas イメージシーケンスの画像未最適化禁止** — WebP形式、モバイル半解像度

## ファイル配置

| パス | 内容 |
|------|------|
| `_shared/lib/gsap-config.ts` | GSAP中央設定、プラグイン登録 |
| `_shared/components/providers/SmoothScrollProvider.tsx` | Lenis + GSAP ticker 同期（`lenis/react` LenisContext 提供） |
| `_shared/hooks/use-motion-preference.ts` | `gsap.matchMedia()` ベースの reactive reduced-motion フック（パターン C 用） |

> **詳細パターン（イージングカタログ、CustomEase、多層パララックス、CSS固定パララックス、ScrollTrigger.batch、横スクロールsnap、セクション重なり、テキストマスクリビール、toggleClass、data-speed、--progress、Perspective Zoom、Canvas イメージシーケンス、MotionPath、SVGアニメーション、Flip、横スクロールギャラリー、CSS scroll-driven、テキスト分割、ui-ux-pro-maxマッピング）**: → `docs/reference/claude-rules/gsap-reference.md`

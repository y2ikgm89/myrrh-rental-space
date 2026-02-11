# GSAP パターン 詳細リファレンス

> このファイルは `.claude/rules/gsap-patterns.md` の詳細セクション。
> コア原則とルールは `.claude/rules/gsap-patterns.md` を参照。

## ムード別イージング選択ガイド

| イージング | ムード | 用途例 |
|-----------|--------|--------|
| `power1.out` | 自然/控えめ | 微妙なフェードイン、背景パララックス |
| `power2.out` | 落ち着いた | 汎用入場アニメーション、カード表示 |
| `power3.out` | 印象的 | Hero入場、ヒーローテキスト |
| `power4.out` | 力強い | アクション要素、スクロール連動 |
| `expo.out` | ドラマチック | 全画面リビール、画面切替 |
| `circ.out` | 技術的 | ダッシュボード、円形UI |
| `sine.inOut` | 穏やか | ループアニメーション、呼吸エフェクト |
| `back.out(1.7)` | 遊び心 | バウンス感のある登場、アイコン |
| `elastic.out(1, 0.3)` | プレイフル | キャラクター登場、祝福演出 |
| `bounce.out` | 弾む | 通知バッジ、ゲーム的UI |
| `steps(12)` | 機械的 | タイプライター、テレタイプ |
| `none` | — | スクラブパララックス（scrub:true必須） |

### CustomEase パターン

gsap-config.ts でCustomEaseを登録して再利用:

```typescript
import { CustomEase } from 'gsap/CustomEase'

gsap.registerPlugin(CustomEase)

CustomEase.create('brand-ease', 'M0,0 C0.22,0.61 0.36,1 1,1')
CustomEase.create('dramatic-reveal', 'M0,0 C0.12,0 0.39,0 0.45,0.13 0.5,0.25 0.56,1 0.56,1 0.72,1 1,1 1,1')

// 使用
gsap.to(el, { y: 0, ease: 'brand-ease' })
```

### イージング設計3原則

| 方向 | 推奨イージング | 理由 |
|------|-------------|------|
| 入場（登場） | `.out` 系 | 速い開始→緩やかな停止で自然 |
| 退場（消失） | `.in` 系 | 緩やかな開始→加速して消失 |
| 遷移（状態変化） | `.inOut` 系 | 滑らかな開始→滑らかな停止 |

## 多層パララックスアーキテクチャ

Hero セクションの5層構造。レイヤーごとにスクロール速度が異なる。

```
Layer 1 (背景):  最も遅い（グラデーション/パターン）
Layer 2 (装飾):  やや遅い（グリッド/ドット）
Layer 3 (中間):  中速（SVGパターン）
Layer 4 (コンテンツ): 通常速度（テキスト、ボタン）— スクロールでフェードアウト
Layer 5 (前景):  最も速い/逆方向（浮遊ドット）
```

```typescript
// 背景: ゆっくり上方向（正のy）
gsap.to('.hero-layer-1', {
  yPercent: 30,
  scrollTrigger: { trigger: section, start: 'top top', end: 'bottom top', scrub: true },
})

// コンテンツ: スクロールでフェードアウト
gsap.to('.hero-content', {
  opacity: 0,
  y: -50,
  scrollTrigger: { trigger: section, start: '20% top', end: '60% top', scrub: true },
})

// 前景: 速く逆方向（コンテンツとの視差を強調）
gsap.to('.hero-layer-5', {
  yPercent: -50,
  scrollTrigger: { trigger: section, start: 'top top', end: 'bottom top', scrub: true },
})
```

## CSS固定パララックス（position: fixed 型）

`position: fixed` レイヤー + 大きなスクロール高さで、GSAP scrub を使わずにパララックスを実現する手法。
レイヤーが固定されたまま、スクロール量に応じて `is-active` クラスを付与して入場アニメーションを制御する。
→ 参考: [azumagumi.co.jp/recruit](https://www.azumagumi.co.jp/recruit/) — イラスト分割レイヤーアニメーション

### アーキテクチャ

```
.scroll-container { height: 300vh; }  ← スクロール距離を確保

Layer -4 (clouds):     position: fixed; — 最背面、自律CSS animation (floating)
Layer -3 (panel):      position: fixed; — 背景パネル、is-active でフェードイン
Layer -2 (characters): position: fixed; — キャラクター、bounce-in で入場
Layer  0 (content):    position: sticky; top: 0 — コンテンツ層
Layer  5 (ornaments):  position: absolute; — 装飾（parallaxなし、固定配置）
```

### 実装パターン

```typescript
'use client'

import { useRef, useCallback, useEffect } from 'react'
import { useGSAP } from '@gsap/react'
import { gsap, ScrollTrigger, prefersReducedMotion } from '../../lib/gsap-config'

export function FixedParallaxHero() {
  const containerRef = useRef<HTMLDivElement>(null)

  const setupAnimations = useCallback(() => {
    if (prefersReducedMotion() || !containerRef.current) return

    const container = containerRef.current

    // 1. スクロール量に応じてクラスを付与（入場トリガー）
    ScrollTrigger.create({
      trigger: container,
      start: 'top top',
      end: '30% top',
      onEnter: () => container.classList.add('is-active'),
    })

    // 2. 固定レイヤーのCSS入場アニメーションはCSSで制御
    //    is-active クラスがCSS keyframesをトリガー

    // 3. スクロール連動の微細な位置補正（オプション）
    gsap.to('.fixed-layer-clouds', {
      y: -60,
      scrollTrigger: {
        trigger: container,
        start: 'top top',
        end: 'bottom top',
        scrub: true,
      },
    })
  }, [])

  useGSAP(setupAnimations, { scope: containerRef })

  return (
    <div ref={containerRef} className="relative" style={{ height: '300svh' }}>
      {/* 固定レイヤー群 */}
      <div className="fixed-layer-clouds fixed inset-0 z-[-4]">
        <img src="/illustrations/clouds.webp" alt="" className="floating-animation" />
      </div>
      <div className="fixed-layer-panel fixed inset-0 z-[-3] opacity-0 transition-opacity duration-1000">
        <img src="/illustrations/bg-panel.svg" alt="" />
      </div>
      <div className="fixed-layer-characters fixed inset-0 z-[-2]">
        {/* 各キャラクターは bounce-in で個別入場 */}
      </div>

      {/* コンテンツ層 */}
      <div className="sticky top-0 z-10 flex h-svh items-center justify-center">
        <h1 className="hero-title">見出しテキスト</h1>
      </div>
    </div>
  )
}
```

### CSS（入場 + 自律アニメーション）

```css
/* is-active でトリガーされる入場アニメーション */
.fixed-layer-panel {
  opacity: 0;
  transition: opacity 1s ease-out;
}
.is-active .fixed-layer-panel {
  opacity: 1;
}

.fixed-layer-characters > * {
  opacity: 0;
  transform: translateY(40px) scale(0.8);
  transition: opacity 0.6s ease-out, transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.is-active .fixed-layer-characters > *:nth-child(1) { transition-delay: 0.2s; opacity: 1; transform: none; }
.is-active .fixed-layer-characters > *:nth-child(2) { transition-delay: 0.4s; opacity: 1; transform: none; }
.is-active .fixed-layer-characters > *:nth-child(3) { transition-delay: 0.6s; opacity: 1; transform: none; }

/* 自律CSS animation（スクロール非連動） */
.floating-animation {
  animation: floating-y 4s ease-in-out infinite;
}

@keyframes floating-y {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-15px); }
}
```

### SVGマスク切り抜き

イラストをパズル型やカスタム形状で切り抜く場合:

```css
.masked-image {
  mask-image: url('/masks/puzzle-shape.svg');
  mask-size: cover;
  mask-repeat: no-repeat;
}
```

### GSAP scrub 型との使い分け

| 手法 | 実装 | 用途 | パフォーマンス |
|------|------|------|-------------|
| **CSS固定パララックス** | `position: fixed` + `height: 300vh` | イラスト分割、入場演出重視 | Excellent（CSS主体） |
| **GSAP scrub パララックス** | `scrub: true` + `yPercent` | スクロール位置と精密同期 | Good（GSAPフレーム処理） |
| **CSS scroll-driven** | `animation-timeline: scroll()` | L1 軽量パララックス | Excellent（メインスレッド外） |

**選択基準**: 入場タイミング制御が主目的ならCSS固定型、スクロール位置との連続同期が必要ならGSAP scrub型。

## ScrollTrigger.batch 一括入場アニメーション

同一クラスの複数要素に対して、ビューポートに入った順にバッチ処理。

```typescript
ScrollTrigger.batch('.batch-item', {
  onEnter: (elements) => gsap.to(elements, {
    opacity: 1,
    y: 0,
    stagger: 0.15,
    overwrite: true,
  }),
  onLeave: (elements) => gsap.to(elements, { opacity: 0, y: 100, overwrite: true }),
  onEnterBack: (elements) => gsap.to(elements, { opacity: 1, y: 0, stagger: 0.15, overwrite: true }),
  start: 'top 90%',
  end: 'top 10%',
})
```

**使い分け**: 個別の `scrollTrigger` ではなく、カード一覧やギャラリーなど同種要素の入場に使用。

## パフォーマンス最適化

```typescript
// GPU acceleration を強制
gsap.set('.accelerated', { force3D: true })

// willChange を一時的に設定（完了後に解除）
gsap.to('.optimized', {
  x: 300,
  willChange: 'transform',
  onComplete: () => gsap.set('.optimized', { willChange: 'auto' }),
})

// autoAlpha で visibility も制御（opacity: 0 時に visibility: hidden）
gsap.to('.hidden', { autoAlpha: 0 })

// 特定要素のアニメーションを破棄
gsap.killTweensOf('.element')
gsap.killTweensOf('.element', 'x,y')  // 特定プロパティのみ

// グローバル設定
gsap.config({
  force3D: true,
  autoSleep: 60,  // アイドル時にスリープ（デフォルト: 120フレーム）
})

// DOM変更後にScrollTriggerをリフレッシュ
ScrollTrigger.refresh()
```

## ScrollTrigger コールバック

```typescript
scrollTrigger: {
  trigger: section,
  start: 'top center',
  end: 'bottom center',
  scrub: true,
  onUpdate: (self) => {
    // self.progress: 0-1 のスクロール進捗
    // self.direction: 1（下スクロール）or -1（上スクロール）
  },
  onEnter: () => { /* ビューポートに入った */ },
  onLeave: () => { /* ビューポートを出た */ },
  onEnterBack: () => { /* 上スクロールで再入場 */ },
  onLeaveBack: () => { /* 上スクロールで出た */ },
}
```

## 横スクロール snap パターン

```typescript
const sections = gsap.utils.toArray<HTMLElement>('.horizontal-section')

gsap.to(sections, {
  xPercent: -100 * (sections.length - 1),
  ease: 'none',
  scrollTrigger: {
    trigger: '.horizontal-container',
    pin: true,
    scrub: 1,
    snap: 1 / (sections.length - 1),  // セクション単位でスナップ
    end: () => `+=${document.querySelector('.horizontal-container')!.offsetWidth}`,
    invalidateOnRefresh: true,
  },
})
```

## セクション重なりアニメーション（Sticky Stacking）

セクションが `position: sticky` で重なりながらスクロールする演出。不動産・レンタルスペースサイトで多用。
→ 参考: [tomore.jp](https://www.tomore.jp/)

### CSS のみ（シンプル）

```css
.stacking-section {
  height: 100svh;
  position: sticky;
  top: 0;
}
```

### GSAP + ScrollTrigger（複雑な制御）

```typescript
const sections = gsap.utils.toArray<HTMLElement>('.stacking-section')

sections.forEach((section, i) => {
  ScrollTrigger.create({
    trigger: section,
    start: 'top top',
    end: i === sections.length - 1 ? 'bottom bottom' : 'bottom top',
    pin: i < sections.length - 1,  // 最後のセクション以外をピン
    pinSpacing: false,
    onEnter: () => { section.style.zIndex = String(sections.length - i) },
  })
})
```

**使い分け**: シンプルな重なりは CSS `sticky`、スケール変化やフェード付きは GSAP で制御。

## テキストマスクリビール

`overflow: hidden` + `translateY` でテキストが下から現れる演出。ブランドサイトの見出しで効果的。

```typescript
// HTML: <div class="text-reveal"><span class="text-reveal-inner">テキスト</span></div>
// CSS: .text-reveal { overflow: hidden; }

gsap.fromTo(
  '.text-reveal-inner',
  { yPercent: 100 },
  {
    yPercent: 0,
    duration: 0.8,
    ease: 'power3.out',
    stagger: 0.12,
    scrollTrigger: {
      trigger: '.text-reveal',
      start: 'top 80%',
      toggleActions: 'play none none none',
    },
  }
)
```

### clip-path マスクリビール

```typescript
gsap.fromTo(
  '.reveal-element',
  { clipPath: 'inset(0 100% 0 0)' },     // 右から隠す
  {
    clipPath: 'inset(0 0% 0 0)',           // 全体表示
    duration: 1.2,
    ease: 'power3.inOut',
    scrollTrigger: {
      trigger: '.reveal-element',
      start: 'top 75%',
      toggleActions: 'play none none none',
    },
  }
)
```

**バリエーション**: `inset(100% 0 0 0)`（下から）、`inset(0 0 100% 0)`（上から）、`circle(0% at 50% 50%)`（円形リビール）

## toggleClass パターン（CSS駆動アニメーション）

GSAPでクラスを付与し、CSS transitionでアニメーション。軽量で `prefersReducedMotion` の CSS `@media` 制御と相性が良い。

```typescript
ScrollTrigger.create({
  trigger: '.animate-on-scroll',
  start: 'top 80%',
  toggleClass: 'is-visible',
  once: true,  // 1回のみ発火
})
```

```css
.animate-on-scroll {
  opacity: 0;
  transform: translateY(40px);
  transition: opacity 0.8s ease, transform 0.8s ease;
}
.animate-on-scroll.is-visible {
  opacity: 1;
  transform: translateY(0);
}

@media (prefers-reduced-motion: reduce) {
  .animate-on-scroll {
    opacity: 1;
    transform: none;
    transition: none;
  }
}
```

## data-speed 属性パターン（宣言的パララックス）

HTML属性でパララックス速度を宣言し、JSで一括適用する軽量パターン。
→ Locomotive Scroll と同一のインターフェース

```typescript
// HTML: <div data-speed="0.5">遅い要素</div>
//       <div data-speed="1.2">速い要素</div>

gsap.utils.toArray<HTMLElement>('[data-speed]').forEach((el) => {
  const speed = parseFloat(el.getAttribute('data-speed') ?? '1')

  gsap.to(el, {
    y: () => (1 - speed) * ScrollTrigger.maxScroll(window) * 0.5,
    ease: 'none',
    scrollTrigger: {
      trigger: el,
      start: 'top bottom',
      end: 'max',
      scrub: true,
      invalidateOnRefresh: true,  // リサイズ時に再計算
    },
  })
})
```

| `data-speed` | 挙動 |
|-------------|------|
| `0` | 固定（スクロールに連動しない） |
| `0.5` | 通常の半分の速度（背景向き） |
| `1` | 通常速度（基準、移動なし） |
| `1.5` | 通常の1.5倍速（前景向き） |

**使いどころ**: 多数の要素に個別の速度を設定する場合。JS側のロジックが1箇所で済む。

## CSS カスタムプロパティ `--progress` パターン

ScrollTrigger の `onUpdate` で CSS変数を更新し、CSS側で複数プロパティを一括制御。
→ Codrops Layered Zoom Effect で採用

```typescript
ScrollTrigger.create({
  trigger: section,
  start: 'top top',
  end: 'bottom top',
  scrub: true,
  pin: true,
  onUpdate: (self) => {
    // イージング付き progress を CSS変数に書き込み
    const eased = gsap.parseEase('power1.inOut')(self.progress)
    section.style.setProperty('--progress', String(eased))
  },
})
```

```css
/* CSS側で --progress を参照して複数プロパティを同時制御 */
.zoom-image {
  transform: scale(calc(1 + var(--progress) * 0.3));
  filter: blur(calc((1 - var(--progress)) * 4px));
}
.zoom-text-left {
  transform: translate3d(calc(var(--progress) * -30vw), 0, 0);
}
.zoom-text-right {
  transform: translate3d(calc(var(--progress) * 30vw), 0, 0);
}
```

**利点**: JS は1つの変数のみ更新、CSS が複数プロパティを同期的に制御。パフォーマンスとメンテナンス性に優れる。

## Perspective Zoom パターン（Z軸レイヤード深度）

`perspective` + Z軸アニメーションで、スクロールに連動した没入型ズーム効果。
→ Codrops "Layered Zoom Scroll Effect"

```typescript
// CSS: .zoom-container { perspective: 100vh; }

const images = gsap.utils.toArray<HTMLElement>('.zoom-layer')
const tl = gsap.timeline({
  scrollTrigger: {
    trigger: '.zoom-container',
    start: 'top top',
    end: 'bottom top',
    scrub: true,
    pin: true,
  },
})

tl.to(images, {
  z: '100vh',                       // Z軸で手前に移動
  duration: 1,
  ease: 'power1.inOut',
  stagger: { amount: 0.2, from: 'center' },  // 中央から波及
})
```

**レイヤー構成**:
```
Layer 1: scale(1.0)  — 最前面、最大サイズ
Layer 2: scale(0.85) — マスク付き
Layer 3: scale(0.6)  — マスク付き
Layer 4: scale(0.45) — 背景寄り
Layer 5: scale(0.3)  — 最背面
```

## Canvas イメージシーケンス（スクロール動画）

Canvas に画像シーケンスを描画し、スクロールでフレームを制御。
Apple 製品ページ風のスクロール動画効果。

```typescript
const canvas = canvasRef.current!
const ctx = canvas.getContext('2d')!
const frameCount = 120  // 総フレーム数
const images: HTMLImageElement[] = []

// 画像プリロード
for (let i = 0; i < frameCount; i++) {
  const img = new Image()
  img.src = `/sequences/frame-${String(i).padStart(4, '0')}.webp`
  images.push(img)
}

const playhead = { frame: 0 }

gsap.to(playhead, {
  frame: frameCount - 1,
  snap: 'frame',              // 整数フレームにスナップ
  ease: 'none',
  scrollTrigger: {
    trigger: canvas,
    start: 'top top',
    end: '+=3000',             // スクロール距離
    pin: true,
    scrub: 0.5,
  },
  onUpdate: () => {
    const img = images[Math.round(playhead.frame)]
    if (img?.complete) {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    }
  },
})
```

**注意**: 画像は WebP 形式で最適化、モバイルでは解像度を下げるかフレーム数を削減。

## MotionPathPlugin（SVGパス追従アニメーション）

SVGパスに沿ってオブジェクトを移動させるアニメーション。ロゴ描画、フローチャート進行、装飾的な動きに使用。

### gsap-config.ts への登録

```typescript
import { MotionPathPlugin } from 'gsap/MotionPathPlugin'
gsap.registerPlugin(MotionPathPlugin)
```

### 基本パターン（SVGパス追従）

```typescript
gsap.to('.moving-element', {
  motionPath: {
    path: '#svg-path',        // SVG path要素のID
    align: '#svg-path',       // パスにアライン
    alignOrigin: [0.5, 0.5],  // 要素の中心をパスに合わせる
    autoRotate: true,          // パスの接線方向に回転
  },
  duration: 3,
  ease: 'none',
  scrollTrigger: {
    trigger: '.path-section',
    start: 'top center',
    end: 'bottom center',
    scrub: true,
  },
})
```

### 座標配列パターン（SVGなし）

```typescript
gsap.to('.element', {
  motionPath: {
    path: [
      { x: 0, y: 0 },
      { x: 200, y: -100 },
      { x: 400, y: 50 },
      { x: 600, y: 0 },
    ],
    curviness: 1.25,  // パスの滑らかさ（0: 直線, 2: 強い曲線）
    autoRotate: 90,    // 90度オフセット
  },
  duration: 2,
  ease: 'power2.inOut',
})
```

### フローチャート進行（スクロール連動）

```typescript
// SVG上のドットがフローチャートのパスに沿って進行
const setupFlowAnimation = useCallback(() => {
  if (prefersReducedMotion()) return

  gsap.set('.flow-dot', { xPercent: -50, yPercent: -50 })
  gsap.to('.flow-dot', {
    motionPath: {
      path: '.flow-path',
      align: '.flow-path',
      alignOrigin: [0.5, 0.5],
    },
    ease: 'none',
    scrollTrigger: {
      trigger: '.flow-section',
      start: 'top 60%',
      end: 'bottom 40%',
      scrub: 1,
    },
  })
}, [])
```

## SVGアニメーション

### SVGストロークドロー（ロゴ描画、ライン装飾）

```typescript
// stroke-dasharray + stroke-dashoffset をGSAP制御
const setupStrokeDraw = useCallback(() => {
  if (prefersReducedMotion()) return

  const paths = gsap.utils.toArray<SVGPathElement>('.draw-path')
  paths.forEach((path) => {
    const length = path.getTotalLength()
    gsap.set(path, {
      strokeDasharray: length,
      strokeDashoffset: length,
    })
    gsap.to(path, {
      strokeDashoffset: 0,
      duration: 2,
      ease: 'power2.inOut',
      scrollTrigger: {
        trigger: path.closest('svg'),
        start: 'top 70%',
        toggleActions: 'play none none none',
      },
    })
  })
}, [])
```

### SVGフィルターアニメーション（feTurbulence 歪み）

```typescript
// SVGフィルター属性をGSAPでアニメーション
const setupSvgFilter = useCallback(() => {
  if (prefersReducedMotion()) return

  gsap.to('#turbulence', {
    attr: { baseFrequency: '0.02 0.05' },  // attr プラグインで属性制御
    duration: 4,
    ease: 'sine.inOut',
    repeat: -1,
    yoyo: true,
  })
}, [])
```

```html
<svg width="0" height="0">
  <filter id="distortion">
    <feTurbulence id="turbulence" type="fractalNoise" baseFrequency="0.01 0.02"
      numOctaves="3" result="noise" />
    <feDisplacementMap in="SourceGraphic" in2="noise" scale="15" />
  </filter>
</svg>
<div style={{ filter: 'url(#distortion)' }}>歪みテキスト</div>
```

### CSSのみストロークアニメーション（L1対応）

GSAPなしでCSS animationでストロークを描画する軽量パターン:

```css
.svg-draw-path {
  stroke-dasharray: var(--path-length);
  stroke-dashoffset: var(--path-length);
  animation: draw-stroke 2s ease-out forwards;
}

@keyframes draw-stroke {
  to { stroke-dashoffset: 0; }
}

/* スクロール連動（CSS scroll-driven, L1） */
@supports (animation-timeline: scroll()) {
  .svg-draw-path {
    animation: draw-stroke linear;
    animation-timeline: scroll();
    animation-range: entry 0% cover 50%;
  }
}
```

## Flip プラグイン（FLIPレイアウトアニメーション）

DOMレイアウト変更を滑らかにアニメーション化。フィルタリングUI、タブ切替、モーダル遷移に使用。

### gsap-config.ts への登録

```typescript
import { Flip } from 'gsap/Flip'
gsap.registerPlugin(Flip)
```

### 基本パターン（フィルタリングUI）

```typescript
const handleFilter = useCallback((category: string) => {
  const items = gsap.utils.toArray<HTMLElement>('.grid-item')

  // 1. 現在の状態を保存
  const state = Flip.getState(items)

  // 2. DOMを変更（フィルタリング）
  items.forEach((item) => {
    const match = item.dataset.category === category || category === 'all'
    item.style.display = match ? '' : 'none'
  })

  // 3. 差分アニメーション
  Flip.from(state, {
    duration: 0.6,
    ease: 'power2.inOut',
    stagger: 0.05,
    absolute: true,       // アニメーション中は position: absolute
    onEnter: (elements) => gsap.fromTo(elements,
      { opacity: 0, scale: 0.8 },
      { opacity: 1, scale: 1, duration: 0.4 }
    ),
    onLeave: (elements) => gsap.to(elements,
      { opacity: 0, scale: 0.8, duration: 0.3 }
    ),
  })
}, [])
```

### タブ切替のハイライトアニメーション

```typescript
const handleTabChange = useCallback((newTab: HTMLElement) => {
  const highlight = document.querySelector('.tab-highlight')!
  const state = Flip.getState(highlight)

  // ハイライト要素を新しいタブに移動
  newTab.appendChild(highlight)

  Flip.from(state, {
    duration: 0.4,
    ease: 'power2.out',
  })
}, [])
```

## 横スクロールギャラリー（詳細パターン）

コンテナ+トラック構造の横スクロール。写真ギャラリー、プロジェクト一覧、タイムラインに使用。

### コンテナ+トラック構造

```typescript
const setupHorizontalScroll = useCallback(() => {
  if (prefersReducedMotion()) return

  const container = containerRef.current
  if (!container) return
  const track = container.querySelector('.horizontal-track') as HTMLElement
  const items = gsap.utils.toArray<HTMLElement>('.horizontal-item', container)

  const mm = gsap.matchMedia()
  mm.add({
    isDesktop: '(min-width: 800px)',
    isMobile: '(max-width: 799px)',
  }, (context) => {
    const { isDesktop } = context.conditions!

    if (isDesktop) {
      const totalWidth = items.reduce((acc, item) => acc + item.offsetWidth + 24, 0)
      const scrollDistance = totalWidth - container.offsetWidth

      const horizontalTween = gsap.to(track, {
        x: -scrollDistance,
        ease: 'none',
        scrollTrigger: {
          trigger: container,
          start: 'top top',
          end: () => `+=${scrollDistance}`,
          pin: true,
          scrub: 1,
          invalidateOnRefresh: true,
          onUpdate: (self) => {
            container.style.setProperty('--scroll-progress', String(self.progress))
          },
        },
      })

      // 各カードのスケール効果（中央が最大）
      items.forEach((item) => {
        gsap.fromTo(item,
          { scale: 0.92, opacity: 0.6 },
          {
            scale: 1,
            opacity: 1,
            scrollTrigger: {
              trigger: item,
              containerAnimation: horizontalTween,  // 変数参照で確実に連携
              start: 'left center',
              end: 'right center',
              scrub: true,
            },
          }
        )
      })
    }
    // モバイル: overflow-x-auto + scroll-snap
  })
}, [])
```

### モバイルフォールバック（CSS scroll-snap）

```css
/* モバイルではネイティブ横スクロール + snap */
@media (max-width: 799px) {
  .horizontal-container {
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    -webkit-overflow-scrolling: touch;
  }
  .horizontal-item {
    scroll-snap-align: center;
    flex-shrink: 0;
    width: 80vw;
  }
}
```

## scrub 値の使い分けガイド

| 値 | 挙動 | 用途 |
|----|------|------|
| `true` | スクロールと1:1同期（即時追従） | 精密なパララックス、clipPath リビール |
| `0.5` | 0.5秒の追従ラグ | 自然な背景パララックス |
| `1` | 1秒の追従ラグ | ピン固定横スクロール、テキストアニメーション |
| `2` | 2秒の追従ラグ | ゆったりした装飾アニメーション |

```typescript
// 追従ラグのイメージ
scrub: true   // スクロール位置 = アニメーション位置（完全同期）
scrub: 1      // スクロール位置に1秒かけて追いつく（スムーズ）
```

## anticipatePin（ピン固定の遅延対策）

ブラウザのスクロールリペイントは別スレッドで処理されるため、高速スクロール時にピンが一瞬遅延する場合がある。

```typescript
scrollTrigger: {
  trigger: section,
  pin: true,
  scrub: 1,
  anticipatePin: 1,  // ピンを少し早めに適用（高速スクロール対策）
}
```

**使いどころ**: 大きなセクションのピン固定で、スクロール速度が速い場合に視覚的なジャンプが発生するとき。

## CSS scroll-driven animation フォールバック

ネイティブ CSS `animation-timeline: scroll()` が使えるブラウザでは CSS のみで処理し、未サポートの場合に GSAP にフォールバック。

```typescript
// フォールバック検出
const supportsScrollTimeline = CSS.supports('animation-timeline', 'scroll()')

if (!supportsScrollTimeline) {
  // GSAP ScrollTrigger でパララックスを実装
  gsap.to('.parallax-bg', {
    yPercent: -20,
    scrollTrigger: { trigger: '.hero', scrub: true },
  })
}
```

```css
/* CSS scroll-driven animation（Chrome/Edge対応） */
@supports (animation-timeline: scroll()) {
  .parallax-bg {
    animation: parallax-move linear;
    animation-timeline: scroll();
    animation-range: 0% 100%;
  }

  @keyframes parallax-move {
    from { transform: translateY(0); }
    to { transform: translateY(-20%); }
  }
}
```

**ブラウザ対応状況（2025年末時点）**: Chrome/Edge/Opera対応、Firefox フラグ付き、Safari未対応。
メインスレッド外で実行されるため、対応ブラウザでは GSAP より高パフォーマンス。

### view-timeline（要素の出入りに連動）

要素がビューポートに入る/出るタイミングに連動するアニメーション:

```css
@supports (animation-timeline: view()) {
  .fade-on-scroll {
    animation: fade-in linear;
    animation-timeline: view();
    animation-range: entry 0% cover 30%;
  }

  @keyframes fade-in {
    from { opacity: 0; transform: translateY(30px); }
    to { opacity: 1; transform: translateY(0); }
  }
}
```

### @property カスタムプロパティ補間

CSS Houdini `@property` で数値型カスタムプロパティを定義し、スクロールで滑らかに補間:

```css
@property --gradient-angle {
  syntax: '<angle>';
  inherits: false;
  initial-value: 0deg;
}

.gradient-rotate {
  background: conic-gradient(from var(--gradient-angle), oklch(0.7 0.2 240), oklch(0.6 0.15 300));
  animation: rotate-gradient linear;
  animation-timeline: scroll();
}

@keyframes rotate-gradient {
  to { --gradient-angle: 360deg; }
}
```

### 名前付き scroll-timeline

特定のスクロールコンテナに名前を付けて、子要素のアニメーションに使用:

```css
.scroll-container {
  scroll-timeline-name: --section-scroll;
  scroll-timeline-axis: block;
  overflow-y: auto;
}

.child-element {
  animation: slide-up linear;
  animation-timeline: --section-scroll;
}
```

## テキスト分割アニメーション

Hero ヘッドラインや見出しで文字・単語・行単位のアニメーション。

### A. SplitText プラグイン（GSAP 公式）

GSAP の `SplitText` プラグインを使用する方法。行・単語・文字の3レベルで分割。

> **GSAP 3.13+**: `SplitText.create()` ファクトリメソッドが推奨。`new SplitText()` も引き続き動作するが、`create()` は将来のAPI拡張に対応。

```typescript
'use client'

import { useRef, useCallback } from 'react'
import { useGSAP } from '@gsap/react'
import { gsap, prefersReducedMotion } from '../../lib/gsap-config'
import { SplitText } from 'gsap/SplitText'

gsap.registerPlugin(SplitText)

export function HeroHeadline({ text }: { text: string }) {
  const headlineRef = useRef<HTMLHeadingElement>(null)

  const setupAnimation = useCallback(() => {
    if (prefersReducedMotion() || !headlineRef.current) return

    // テキストを文字単位で分割（DOM操作）
    const split = SplitText.create(headlineRef.current, {
      type: 'chars,words,lines',  // 分割レベル
      linesClass: 'split-line',
      wordsClass: 'split-word',
      charsClass: 'split-char',
    })

    // 文字ごとのスタガーアニメーション
    gsap.fromTo(
      split.chars,
      { opacity: 0, y: 40, rotateX: 40 },
      {
        opacity: 1,
        y: 0,
        rotateX: 0,
        duration: 0.6,
        stagger: 0.03,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: headlineRef.current,
          start: 'top 80%',
          toggleActions: 'play none none none',
        },
      }
    )

    // クリーンアップ: SplitText のDOMを復元
    return () => split.revert()
  }, [])

  useGSAP(setupAnimation, { scope: headlineRef })

  return <h1 ref={headlineRef} className="hero-headline">{text}</h1>
}
```

#### SplitText 分割タイプ

| type | 生成要素 | 用途 |
|------|---------|------|
| `'chars'` | 各文字を `<div>` でラップ | 文字単位の入場、ランダム散乱 |
| `'words'` | 各単語を `<div>` でラップ | 単語単位のフェードイン |
| `'lines'` | 各行を `<div>` でラップ | 行単位のマスクリビール |
| `'chars,words'` | 文字＋単語の二重ラップ | 文字アニメーション + 単語単位の位置制御 |
| `'chars,words,lines'` | 三重ラップ | 最大制御（行マスク + 文字アニメーション） |

#### 行マスクリビールパターン

```typescript
const split = new SplitText(element, { type: 'lines' })

// 各行の親に overflow: hidden を適用
split.lines.forEach((line) => {
  const wrapper = document.createElement('div')
  wrapper.style.overflow = 'hidden'
  line.parentNode?.insertBefore(wrapper, line)
  wrapper.appendChild(line)
})

gsap.fromTo(
  split.lines,
  { yPercent: 100 },
  {
    yPercent: 0,
    duration: 0.8,
    stagger: 0.12,
    ease: 'power3.out',
    scrollTrigger: {
      trigger: element,
      start: 'top 80%',
      toggleActions: 'play none none none',
    },
  }
)
```

#### スクラブ連動テキストリビール

```typescript
const split = new SplitText(element, { type: 'chars' })

gsap.fromTo(
  split.chars,
  { opacity: 0.15 },
  {
    opacity: 1,
    stagger: 0.05,
    scrollTrigger: {
      trigger: element,
      start: 'top 60%',
      end: 'bottom 40%',
      scrub: true,   // スクロールに連動して1文字ずつ表示
    },
  }
)
```

### B. 手動分割（SplitText 未使用）

`SplitText` プラグインを使わない軽量パターン。React コンポーネントで分割。

```typescript
function SplitChars({ text }: { text: string }) {
  return (
    <>
      {text.split('').map((char, i) => (
        <span key={i} className="hero-char inline-block" style={{ transitionDelay: `${i * 30}ms` }}>
          {char === ' ' ? '\u00A0' : char}
        </span>
      ))}
    </>
  )
}

// GSAPで各文字をアニメーション
gsap.fromTo(
  '.hero-char',
  { opacity: 0, y: 30, rotateX: 40 },
  {
    opacity: 1,
    y: 0,
    rotateX: 0,
    duration: 0.6,
    stagger: 0.03,
    ease: 'power3.out',
  }
)
```

### A vs B 使い分け

| 基準 | SplitText（A） | 手動分割（B） |
|------|---------------|-------------|
| 行分割 | `type: 'lines'` で自動 | 実装困難（レスポンシブで行が変わる） |
| リバート | `split.revert()` でDOM復元 | DOM変更なし |
| 日本語 | 単語分割に課題（句読点区切り） | 文字分割は問題なし |
| バンドルサイズ | +15KB（SplitTextプラグイン） | 0（追加なし） |
| 推奨 | 行マスクリビール、scrub連動 | 単純な文字入場アニメーション |

## Lenis モバイル設定

```typescript
const lenis = new Lenis({
  lerp: isMobile ? 0.12 : 0.08,       // モバイルはやや速い補間（慣性軽減）
  duration: isMobile ? 1.0 : 1.4,     // モバイルは短い持続時間
  touchMultiplier: 2,                   // タッチスクロール感度
  wheelMultiplier: 1,
  smoothWheel: true,
  syncTouch: true,                      // タッチでもスムーズ（iOS対応）
})

// Lenis 公式推奨 GSAP 統合パターン
lenis.on('scroll', ScrollTrigger.update)
gsap.ticker.add((time) => { lenis.raf(time * 1000) })
gsap.ticker.lagSmoothing(0)
gsap.config({ autoSleep: 0 })  // ticker スリープ防止（必須）
```

**注意**: `gsap.config({ autoSleep: 0 })` は必須。デフォルト（120フレーム ~2秒）ではアイドル後に ticker が停止し、`lenis.raf()` が呼ばれなくなりスクロールがデッドロックする。

## セクション重なり（Stacking）のモバイル対応

```typescript
const mm = gsap.matchMedia()

mm.add({
  isDesktop: '(min-width: 800px)',
  isMobile: '(max-width: 799px)',
}, (context) => {
  const { isDesktop } = context.conditions!

  if (isDesktop) {
    // デスクトップ: sticky stacking + scale/fade演出
    sections.forEach((section, i) => {
      ScrollTrigger.create({
        trigger: section,
        start: 'top top',
        pin: i < sections.length - 1,
        pinSpacing: false,
      })
    })
  }
  // モバイル: sticky/pinなし、通常スクロールでセクション遷移
  // CSS `scroll-snap-type: y mandatory` で代替可能
})
```

## ui-ux-pro-max スタイル対応

GSAP パターンと `ui-ux-pro-max` スタイルデータベースの対応関係。
デザイン方針決定時に `ui-ux-pro-max` 検索結果を参照し、適切なGSAPパターンを選択する。

### スタイル → GSAP パターン マッピング

| スタイル | GSAP パターン | 推奨 scrub | 推奨 ease | 注意事項 |
|---------|-------------|-----------|----------|---------|
| **Motion-Driven** (15) | useGSAP + ScrollTrigger 全般 | `true` / `0.5` | `power2.out` | GSAP 10/10。パララックス3-5層、ページトランジション |
| **Parallax Storytelling** (49) | pin + scrub + stacking | `1` | `none` | セクション進行型。position:fixed/sticky + scroll-triggered |
| **Kinetic Typography** (48) | SplitText + stagger + scrub | `true` | `power3.out` | GSAP 10/10。background-clip:text、文字分割アニメーション |
| **Dimensional Layering** (46) | z-index stacking + translateZ | `true` | `none` | 深度表現。box-shadow + perspective + parallax |
| **Liquid Glass** (14) | morphing + blur + scrub | `0.5` | `power1.inOut` | GSAP 10/10。backdrop-filter連動、CSS --progress 推奨 |
| **Hero-Centric Design** (20) | hero入場 + 背景パララックス | `true`（BG）| `power2.out`（入場）| CTA pulse、value prop stagger |
| **Storytelling-Driven** (27) | chapter transition + scroll reveal | `1` | `power1.inOut` | 感情的遷移。section-to-section のグラデーション変化 |

### ランディングパターン → GSAP 構成

| パターン | セクション構成 | 主要GSAPアニメーション |
|---------|-------------|---------------------|
| **Hero + Features + CTA** (1) | hero(pin) → features(batch) → cta(scale) | `scrub`パララックス + `toggleActions`入場 + CTA glow |
| **Scroll-Triggered Storytelling** (10) | intro → chapter×3 → climax | `pin` + `scrub: 1` + progressive disclosure + `--progress` |
| **Video-First Hero** (9) | video-hero(pin) → features → cta | video autoplay + `scrub`パララックス + text fade-in |
| **Horizontal Scroll Journey** (27) | intro(vertical) → journey(horizontal) → footer | `pin` + `scrub` + `x: () => -(scrollWidth - viewWidth)` |
| **Bento Grid Showcase** (28) | hero → bento-grid → detail → cta | `ScrollTrigger.batch` + hover scale(1.02) + stagger reveal |

### 検索コマンド例

```bash
# スタイルに合うGSAPパターンを調査
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "motion parallax scroll" --domain style

# アニメーションのUXガイドライン
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "animation timing scroll" --domain ux

# Next.js固有のスクロール最適化
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "scroll animation lazy" --stack nextjs
```

→ `.claude/skills/parallax-section/SKILL.md` の Step 1.5 で詳細な検索フローを参照

## タイムラインオーケストレーション

### gsap.timeline() 基本チェーン

```typescript
const tl = gsap.timeline({ defaults: { duration: 0.8, ease: 'power2.out' } })

tl.to('.element-a', { opacity: 1, y: 0 })
  .to('.element-b', { opacity: 1, y: 0 }, '-=0.4')  // 0.4秒前から重複開始
  .to('.element-c', { scale: 1 }, '<')                // 前のアニメと同時
  .to('.element-d', { x: 100 }, '>')                  // 前のアニメ完了後
```

### ラベル + `.add()` タイムオフセット

```typescript
const tl = gsap.timeline()

tl.addLabel('intro')
  .to('.logo', { opacity: 1, duration: 0.5 }, 'intro')
  .to('.tagline', { opacity: 1, y: 0 }, 'intro+=0.3')
  .addLabel('content', '+=0.5')  // 前のアニメから0.5秒後にラベル
  .to('.card', { opacity: 1, y: 0, stagger: 0.12 }, 'content')
  .to('.cta', { scale: 1 }, 'content+=0.8')
```

### ScrollTrigger 連動タイムライン（scrub timeline）

スクロール進行でタイムラインを制御。pin と組み合わせてステップ進行を実現:

```typescript
const tl = gsap.timeline({
  scrollTrigger: {
    trigger: '.story-section',
    start: 'top top',
    end: '+=3000',          // 3000pxのスクロール距離
    pin: true,
    scrub: 1,
    invalidateOnRefresh: true,
  },
})

tl.to('.step-1', { opacity: 1, y: 0 })
  .to('.step-1-img', { scale: 1.1 }, '<')
  .addLabel('step2', '+=0.2')
  .to('.step-1', { opacity: 0 }, 'step2')
  .to('.step-2', { opacity: 1, y: 0 }, 'step2+=0.1')
  .to('.step-2-img', { scale: 1.1 }, '<')
```

### ネストタイムライン（セクション単位）

マスタータイムラインに各セクションのタイムラインをネスト:

```typescript
function createSectionTimeline(section: HTMLElement): gsap.core.Timeline {
  const tl = gsap.timeline()
  tl.fromTo(section.querySelector('.title'), { opacity: 0, y: 30 }, { opacity: 1, y: 0 })
    .fromTo(section.querySelector('.body'), { opacity: 0 }, { opacity: 1 }, '-=0.3')
  return tl
}

const masterTl = gsap.timeline({
  scrollTrigger: { trigger: '.container', start: 'top top', end: 'bottom bottom', scrub: 1 },
})

sections.forEach((section, i) => {
  masterTl.add(createSectionTimeline(section), i * 0.25)
})
```

### タイムライン制御API

| メソッド | 用途 | 例 |
|---------|------|-----|
| `tl.pause()` | 一時停止 | モーダル表示時 |
| `tl.resume()` | 再開 | モーダル閉じ時 |
| `tl.seek('label')` | ラベル位置にジャンプ | ナビゲーション |
| `tl.progress(0.5)` | 50%位置にジャンプ | スライダー連動 |
| `tl.timeScale(0.5)` | 半速再生 | ドラマチック演出 |
| `tl.reverse()` | 逆再生 | 退場アニメーション |
| `tl.restart()` | 最初から再生 | リピート演出 |
| `tl.totalDuration()` | 合計時間取得 | プログレスバー計算 |

## Advanced Lenis 設定

### アンカースクロール

```typescript
lenis.scrollTo('#section-about', {
  offset: -80,            // ヘッダー高さ分オフセット
  duration: 1.5,
  easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),  // easeOutExpo
  immediate: false,       // アニメーション付き
  lock: true,             // スクロール中にユーザーのスクロールをロック
})
```

### プログラマティックスクロール

```typescript
// ページトップへ
lenis.scrollTo(0, { duration: 2 })

// 特定のDOM要素へ
lenis.scrollTo(document.querySelector('.target-section')!, { offset: -100 })

// 相対スクロール（Lenisは相対文字列未対応、数値で指定）
lenis.scrollTo(lenis.scroll + 500, { duration: 1 })  // 現在位置から500px下（lenis.scroll で内部状態と整合）
```

### Lenis stop/start（モーダル/オーバーレイ管理）

```typescript
// モーダルオープン時: スクロール停止
function openModal() {
  lenis.stop()
  // モーダル表示処理
}

// モーダルクローズ時: スクロール再開
function closeModal() {
  lenis.start()
}

// ネストスクロール領域（モーダル内スクロール）
// Lenis stop中でもモーダル内のスクロールは有効にする場合:
const modalLenis = new Lenis({
  wrapper: modalRef.current!,
  content: modalContentRef.current!,
  autoRaf: true,  // メインのLenisとは別にrAFを管理
})
```

### ハッシュナビゲーション連携

```typescript
useEffect(() => {
  const handleHashChange = () => {
    const hash = window.location.hash
    if (hash) {
      lenis.scrollTo(hash, { offset: -80, duration: 1.2 })
    }
  }

  window.addEventListener('hashchange', handleHashChange)
  // 初期ロード時のハッシュ処理
  if (window.location.hash) handleHashChange()

  return () => window.removeEventListener('hashchange', handleHashChange)
}, [lenis])
```

### ネストスクロール領域

水平スクロールギャラリーやカルーセル内でLenisと競合しないパターン:

```typescript
// ネストスクロールコンテナでLenisの介入を防止
const nestedContainer = document.querySelector('.horizontal-scroll')!
nestedContainer.setAttribute('data-lenis-prevent', '')

// 特定の方向のみ防止
nestedContainer.setAttribute('data-lenis-prevent-wheel', '')    // ホイールのみ
nestedContainer.setAttribute('data-lenis-prevent-touch', '')    // タッチのみ
```

## パフォーマンス最適化拡張

### will-change ライフサイクル管理

```typescript
// アニメーション開始時にwill-changeを設定、完了時に解除
gsap.to('.optimized', {
  x: 300,
  onStart: () => gsap.set('.optimized', { willChange: 'transform' }),
  onComplete: () => gsap.set('.optimized', { willChange: 'auto' }),
})

// 大量要素: ScrollTrigger enter/leave で管理
ScrollTrigger.create({
  trigger: section,
  start: 'top bottom',
  end: 'bottom top',
  onEnter: () => gsap.set('.animate-items', { willChange: 'transform, opacity' }),
  onLeave: () => gsap.set('.animate-items', { willChange: 'auto' }),
  onEnterBack: () => gsap.set('.animate-items', { willChange: 'transform, opacity' }),
  onLeaveBack: () => gsap.set('.animate-items', { willChange: 'auto' }),
})
```

### gsap.context() 一括クリーンアップ

```typescript
// context内の全アニメーション・ScrollTriggerを一括で破棄
const ctx = gsap.context(() => {
  gsap.to('.el-a', { x: 100 })
  gsap.to('.el-b', { y: 50 })
  ScrollTrigger.create({ trigger: '.section', ... })
}, sectionRef)  // scope: sectionRef内のセレクタに限定

// クリーンアップ
return () => ctx.revert()  // 全アニメーション + ST を一括破棄
```

**注意**: `useGSAP` は内部で `gsap.context()` を使用しているため、通常は `useGSAP` を使用すれば自動管理される。手動の `gsap.context()` は `useGSAP` を使えない特殊ケース（非Reactコード、外部ライブラリ連携等）でのみ使用。

### Lazy ScrollTrigger（IntersectionObserver ゲート）

ページ内にScrollTriggerが大量にある場合、ビューポート近傍のもののみ有効化:

```typescript
const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        // ビューポート進入時にScrollTriggerを作成
        createSectionAnimations(entry.target as HTMLElement)
        observer.unobserve(entry.target)  // 1回のみ
      }
    })
  },
  { rootMargin: '200px' }  // 200px手前から初期化
)

document.querySelectorAll('.lazy-section').forEach((section) => {
  observer.observe(section)
})
```

### バッチ vs 個別 ScrollTrigger 判断基準

| 基準 | `ScrollTrigger.batch()` | 個別 `ScrollTrigger` |
|------|------------------------|---------------------|
| 同種要素 | カード一覧、ギャラリー | 過剰 |
| 異なるアニメーション | 不向き | 各セクション固有のアニメーション |
| 大量要素（50+） | パフォーマンス良好 | 要Lazyゲート |
| stagger制御 | 自動stagger | 手動設定必要 |
| scrub連動 | 非対応 | scrub対応 |

### rAF バジェット意識

```typescript
// ticker での処理は60fps = 16.7msバジェット
gsap.ticker.add((time, deltaTime) => {
  // 軽量な処理のみ: CSS変数更新、ref更新
  // 重い処理（DOM測定、レイアウト計算）はここに入れない
})

// フレームスキップ検出
gsap.ticker.add((time, deltaTime) => {
  if (deltaTime > 50) {
    // 50ms以上のフレームスキップ → パフォーマンス警告
    console.warn('Frame skip detected:', deltaTime, 'ms')
  }
})
```

## ページ/セクション遷移アニメーション

### Exit → Push → Enter パターン

```typescript
async function navigateWithTransition(url: string) {
  // 1. Exit アニメーション
  await gsap.to('.page-content', {
    opacity: 0,
    y: -30,
    duration: 0.4,
    ease: 'power2.in',
  })

  // 2. ルーティング
  router.push(url)

  // 3. Enter アニメーション（ページ遷移後）
  // → 遷移先ページの useGSAP で入場アニメーションが自動実行
}
```

### View Transitions API + GSAP 連携

```typescript
async function navigateTo(url: string) {
  if (!document.startViewTransition) {
    router.push(url)
    return
  }

  // GSAP exit アニメーションを View Transition の前に実行
  await gsap.to('.hero-image', { scale: 0.9, opacity: 0, duration: 0.3 })

  // View Transition のコールバックはDOM更新のみ（同期的）
  document.startViewTransition(() => {
    router.push(url)
  })
}
```

### Shared Element Transitions（view-transition-name）

```css
/* 遷移元（一覧ページ） */
.space-card-image {
  view-transition-name: space-hero;
}

/* 遷移先（詳細ページ） */
.space-detail-hero {
  view-transition-name: space-hero;
}

/* カスタムアニメーション */
::view-transition-old(space-hero) {
  animation: scale-down 0.4s ease-in forwards;
}
::view-transition-new(space-hero) {
  animation: scale-up 0.4s ease-out forwards;
}
```

### セクション間カラーモーフィング

スクロール進行でセクション間の背景色を連続的に補間:

```typescript
const sectionColors = [
  { l: 0.1, c: 0.2, h: 240 },   // セクション1: ダークブルー
  { l: 0.08, c: 0.15, h: 150 },  // セクション2: ダークグリーン
  { l: 0.12, c: 0.25, h: 30 },   // セクション3: ダークオレンジ
]

sections.forEach((section, i) => {
  if (i >= sectionColors.length - 1) return
  const from = sectionColors[i]
  const to = sectionColors[i + 1]

  ScrollTrigger.create({
    trigger: section,
    start: 'top center',
    end: 'bottom center',
    scrub: true,
    onUpdate: (self) => {
      const p = self.progress
      const l = from.l + (to.l - from.l) * p
      const c = from.c + (to.c - from.c) * p
      const h = from.h + (to.h - from.h) * p
      document.body.style.setProperty('--section-bg', `oklch(${l} ${c} ${h})`)
    },
  })
})
```

## スクロール連動ビデオ/メディア

### HTML5 video.currentTime = progress x duration

```typescript
const video = videoRef.current!
const duration = video.duration || 10  // フォールバック

ScrollTrigger.create({
  trigger: '.video-section',
  start: 'top top',
  end: '+=3000',
  pin: true,
  scrub: true,
  onUpdate: (self) => {
    video.currentTime = self.progress * duration
  },
})

// 動画のmetadata読み込みを待機
video.addEventListener('loadedmetadata', () => {
  ScrollTrigger.refresh()
})
```

### IntersectionObserver play/pause

ビューポート外の動画を停止してパフォーマンス確保:

```typescript
const videoObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      const video = entry.target as HTMLVideoElement
      if (entry.isIntersecting) {
        video.play().catch(() => {})  // autoplay制限でのエラーを無視
      } else {
        video.pause()
      }
    })
  },
  { threshold: 0.25 }  // 25%表示で再生開始
)

document.querySelectorAll('video[data-autoplay]').forEach((video) => {
  videoObserver.observe(video)
})
```

### ビデオ + オーバーレイテキスト協調

```typescript
const tl = gsap.timeline({
  scrollTrigger: {
    trigger: '.video-hero',
    start: 'top top',
    end: '+=4000',
    pin: true,
    scrub: 1,
  },
})

// ビデオ進行
tl.to(video, { currentTime: video.duration, duration: 1, ease: 'none' })

// テキストオーバーレイ（ビデオの特定タイミングに同期）
tl.fromTo('.overlay-title', { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.1 }, 0.2)
  .to('.overlay-title', { opacity: 0, y: -30, duration: 0.1 }, 0.4)
  .fromTo('.overlay-subtitle', { opacity: 0 }, { opacity: 1, duration: 0.1 }, 0.5)
  .to('.overlay-subtitle', { opacity: 0, duration: 0.1 }, 0.8)
```

## デバッグ & よくある落とし穴

### デバッグツール

```typescript
// 1. ScrollTrigger マーカー表示
ScrollTrigger.create({
  trigger: section,
  markers: true,        // start/end 位置を可視化（開発時のみ）
  // ...
})

// 2. 全ScrollTriggerインスタンスの確認
console.log(ScrollTrigger.getAll())
ScrollTrigger.getAll().forEach((st) => {
  console.log(st.trigger, st.start, st.end, st.progress)
})

// 3. グローバルタイムライン制御
gsap.globalTimeline.timeScale(0.2)  // 全アニメーションを5倍スロー
gsap.globalTimeline.pause()         // 全停止
gsap.globalTimeline.resume()        // 再開

// 4. タイムライン進行デバッグ
tl.eventCallback('onUpdate', () => {
  console.log('progress:', tl.progress(), 'time:', tl.time())
})

// 5. 特定要素のアニメーション確認
gsap.getTweensOf('.target-element').forEach((tween) => {
  console.log(tween.vars, tween.progress(), tween.isActive())
})
```

### 症状別トラブルシューティング

| 症状 | 原因候補 | 対策 |
|------|---------|------|
| ScrollTrigger が不発火 | `scope` 未設定（useGSAP） | `useGSAP(fn, { scope: ref })` で scope 指定 |
| | Lenis 未初期化時にST作成 | Lenis ready 後に ST 作成 / `lenis.on('scroll', ST.update)` |
| | DOM が非表示 | `display: none` → `visibility: hidden` + `opacity: 0` |
| pin でジャンプする | 高速スクロール時の遅延 | `anticipatePin: 1` |
| | リサイズ時の再計算漏れ | `invalidateOnRefresh: true` |
| | Lenis との二重スクロール | Lenis ticker 内で `ScrollTrigger.update()` |
| Lenis との競合 | 複数スクロールインスタンス | 単一 Lenis インスタンスに統一 |
| | ネストスクロール | `data-lenis-prevent` 属性 |
| モバイルで pin 破壊 | iOS Safari の描画問題 | `gsap.matchMedia()` でモバイルは pin 回避 |
| SSR エラー | サーバーで window 参照 | `'use client'` + `typeof window !== 'undefined'` |
| CLS（レイアウトシフト） | pin の pinSpacing 不足 | `pinSpacing: true`（デフォルト維持） |
| | 画像未ロードで高さ不定 | `width`/`height` 属性 + `aspect-ratio` |
| SplitText 崩れ | リサイズで行が変わる | `split.revert()` → 再分割 → `ScrollTrigger.refresh()` |
| markers 本番残存 | 条件分岐漏れ | `markers: process.env.NODE_ENV === 'development'` |

### markers 本番防止パターン

```typescript
const isDev = process.env.NODE_ENV === 'development'

ScrollTrigger.create({
  trigger: section,
  markers: isDev,  // 開発時のみマーカー表示
  // ...
})
```

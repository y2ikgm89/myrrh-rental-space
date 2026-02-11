---
paths:
  - src/app/(public*)/**
---

# PixiJS パターンルール

> PixiJS v8 / WebGL2 / カスタムGLSLフィルター

## 概要

PixiJS v8 による2Dエフェクト（フィルムグレイン、ビネット、パーティクルスプライト）。
エフェクトレベル L4 専用（デスクトップ専用GPU のみ）。
→ `.claude/rules/visual-effects-patterns.md`

> **詳細リファレンス**: `docs/reference/claude-rules/pixijs-reference.md`

## SSRゲートパターン

ThreeCanvas と同一の3段階ゲート。L4 専用。

```typescript
// 1. next/dynamic でSSR除外
const PixiCanvasInner = dynamic(() => import('./PixiCanvasInner'), { ssr: false })

// 2. L4 + budget チェック
const shouldRenderPixi = effectLevel >= 4 && budget.allowPixiJs

// 3. IntersectionObserver（rootMargin: 100px）
```

## 非同期初期化（v8必須）

```typescript
const pixiApp = new Application()
await pixiApp.init({
  backgroundAlpha: 0, antialias: false, preference: 'webgl',
  resolution: Math.min(window.devicePixelRatio, 2),
  autoDensity: true, resizeTo: container, autoStart: true,
})
```

## FPS自動劣化

60サンプル平均が30fps未満 × 3回連続で L3 に劣化。

```typescript
const FPS_SAMPLE_SIZE = 60, FPS_THRESHOLD = 30, FPS_FAIL_LIMIT = 3
```

## v7 → v8 移行

| v7 | v8 |
|----|-----|
| `new Application({ ... })` | `new Application()` + `await app.init({ ... })` |
| `app.view` | `app.canvas` |
| `PIXI.` グローバル | 名前付きimport |

## カスタムフィルター共通 vertex shader

PixiJS v8 の `Filter` は vertex shader が**必須**。省略するとエラー:

```glsl
// 全カスタムフィルターで共通使用
in vec2 aPosition;
out vec2 vTextureCoord;
uniform vec4 uInputSize;
uniform vec4 uInputPixel;
uniform vec4 uInputClamp;
uniform vec4 uOutputFrame;
uniform vec4 uGlobalFrame;
uniform mat3 uFilterMatrix;

void main(void) {
  gl_Position = vec4((uOutputFrame.xy + aPosition * uOutputFrame.zw) * 2.0 / uGlobalFrame.zw - 1.0, 0.0, 1.0);
  vTextureCoord = (aPosition * uOutputFrame.zw + uOutputFrame.xy - uGlobalFrame.xy) / uInputSize.xy;
}
```

`GlProgram.from({ vertex, fragment })` で vertex/fragment 両方を渡す（推奨API）。
内蔵 uniform（`uInputSize`, `uOutputFrame` 等）は自動注入されるため `resources` での定義は不要。

## Grain フィルター（uTime アニメーション）

```glsl
uniform float uIntensity;
uniform float uTime;

float random(vec2 co) {
  return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

void main(void) {
  vec4 color = texture(uTexture, vTextureCoord);
  float noise = random(vTextureCoord + vec2(uTime)) * 2.0 - 1.0;
  color.rgb += noise * uIntensity;
  finalColor = color;
}
```

```typescript
filter = new Filter({
  glProgram,
  resources: {
    grainUniforms: {
      uIntensity: { value: intensity, type: 'f32' },
      uTime: { value: 0, type: 'f32' },
    },
  },
})

app.ticker.add((ticker) => {
  uniforms.uniforms.uTime += ticker.deltaTime * 0.01 * speed
})
```

## パーティクルスプライト決定的ハッシュ

```typescript
function deterministicHash(seed: number): number {
  let hash = seed
  hash = ((hash >> 16) ^ hash) * 0x45d9f3b
  hash = ((hash >> 16) ^ hash) * 0x45d9f3b
  hash = (hash >> 16) ^ hash
  return (hash & 0x7fffffff) / 0x7fffffff
}
```

## フィルターライフサイクル

非同期セットアップ + `destroyed` フラグでマウント解除チェック。cleanup で ticker 除去 + フィルター配列から除去 + `filter.destroy()`。

## モバイル

PixiJS は L4 専用。モバイルでは**常に無効化**（`isMobile` ペナルティで L4 到達不可）。
フォールバック: CSS `radial-gradient` + noise テクスチャ。

## CLS対策

| 対策 | 実装 |
|------|------|
| Canvas初期サイズ | `absolute inset-0 z-[3]` で CLS 防止（z-index: `visual-effects-patterns.md` §Z-index ベースライン準拠） |
| CSS containment | `contain: layout paint` |
| FPS自動劣化 | 60サンプル平均 < 30fps × 3回で L3 にダウングレード |
| 非表示時停止 | `IntersectionObserver` |
| 解放 | unmount時に `app.destroy({ removeView: true })` |

## GSAP ↔ PixiJS 統合要約

GSAP で PixiJS フィルターの uniform を直接制御:

```typescript
// gsap.to() で uniform をアニメーション
gsap.to(filter.resources['grainUniforms'].uniforms, {
  uIntensity: 0.08,
  duration: 1.5,
  ease: 'power2.inOut',
})

// ScrollTrigger onUpdate → filter intensity
ScrollTrigger.create({
  trigger: '.section',
  scrub: true,
  onUpdate: (self) => {
    const uniforms = filter.resources['grainUniforms'].uniforms
    uniforms.uIntensity = 0.02 + self.progress * 0.06
  },
})
```

**スクロール速度連動**: `Math.min(Math.abs(velocity) * 0.002, maxIntensity)` で速度に応じたフィルター強度を計算。

> **詳細（タイムライン駆動シーケンス、DOM協調、速度計算式）**: → `docs/reference/claude-rules/pixijs-reference.md` §GSAP ↔ PixiJS タイムライン統合

## 禁止事項

1. **PixiJS の同期 import 禁止** — `await import('pixi.js')` で非同期ロード
2. **destroyed チェック省略禁止** — 非同期セットアップ後に `if (destroyed) return`
3. **Math.random() 禁止** — `deterministicHash()` 使用
4. **フィルター除去漏れ禁止** — cleanup で `app.stage.filters` から除去 + `filter.destroy()`
5. **ticker コールバック除去漏れ禁止** — `app.ticker.remove(callback)`
6. **L4未満でのPixiJS描画禁止** — `effectLevel >= 4 && budget.allowPixiJs` チェック
7. **WebGLコンテキスト登録漏れ禁止**
8. **type import 以外でのトップレベル PixiJS import 禁止**
9. **v7 API の使用禁止** — `app.view` → `app.canvas` 等

## ファイル配置

| パス | 内容 |
|------|------|
| `effects/pixi/PixiCanvas.tsx` | SSRゲート + L4チェック |
| `effects/pixi/PixiCanvasInner.tsx` | Application 初期化 + FPS監視 |
| `effects/pixi/PixiGrain.tsx` | フィルムグレインGLSLフィルター |
| `effects/pixi/PixiVignette.tsx` | ビネットGLSLフィルター |
| `effects/pixi/PixiParticleSprites.tsx` | 2Dボケパーティクル |
| `effects/pixi/hooks/use-pixi-app.ts` | Application Context フック |
| `effects/pixi/hooks/use-pixi-scroll.ts` | Lenis → ref スクロール同期 |

> **詳細パターン（共通頂点シェーダー、フィルターカタログ10種表、Vignette/Blur/Displacement/ColorMatrix/Scanline/Glow/Shockwave GLSLコード、フィルター組合せガイド、Graphics API表+ベジェ例、スクロール速度連動、スプライトアニメーション、インタラクティブパターン4種、テキストエフェクト、WebGPU、ui-ux-pro-maxマッピング）**: → `docs/reference/claude-rules/pixijs-reference.md`

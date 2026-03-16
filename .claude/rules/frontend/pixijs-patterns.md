---
paths:
  - src/app/(public*)/_shared/components/effects/pixi/**
---

# PixiJS パターンルール

> PixiJS 8.16.0 / WebGL2 / カスタムGLSLフィルター

## 概要

PixiJS v8 による2Dエフェクト（フィルムグレイン、ビネット、パーティクルスプライト）。
エフェクトレベル L4 専用（デスクトップ専用GPU のみ）。
→ `.claude/rules/visual-effects-patterns.md`

> **詳細リファレンス**: `docs/reference/claude-rules/pixijs-reference.md`

## SSRゲートパターン

ThreeCanvas と同一の3段階ゲート。L4 専用。

```typescript
// 1. next/dynamic でSSR除外
const PixiCanvasInner = dynamic(
  () => import("./PixiCanvasInner").then((mod) => mod.PixiCanvasInner),
  { ssr: false },
);

// 2. L4 + budget チェック
const shouldRenderPixi = effectLevel >= 4 && budget.allowPixiJs;

// 3. IntersectionObserver（rootMargin: 100px）
```

## 非同期初期化（v8必須）

```typescript
const pixiApp = new Application();
await pixiApp.init({
  backgroundAlpha: 0,
  antialias: false,
  preference: "webgl",
  resolution: Math.min(window.devicePixelRatio, 2),
  autoDensity: true,
  resizeTo: container,
  autoStart: true,
});
```

## FPS自動劣化

60サンプル平均が30fps未満 × 3回連続で L3 に劣化（`degradeTo(3)` を呼び出す）。

```typescript
const FPS_SAMPLE_SIZE = 60,
  FPS_THRESHOLD = 30,
  FPS_FAIL_LIMIT = 3;

pixiApp.ticker.add((ticker) => {
  fpsSamples.push(ticker.FPS);
  if (fpsSamples.length === FPS_SAMPLE_SIZE) {
    const avgFps = fpsSamples.reduce((s, f) => s + f, 0) / FPS_SAMPLE_SIZE;
    if (avgFps < FPS_THRESHOLD) {
      failCount++;
      if (failCount >= FPS_FAIL_LIMIT) {
        degradeTo(3); // L3 にダウングレード
      }
    } else {
      failCount = 0;
    }
    fpsSamples.length = 0;
  }
});
```

## v7 → v8 移行

| v7                         | v8                                              |
| -------------------------- | ----------------------------------------------- |
| `new Application({ ... })` | `new Application()` + `await app.init({ ... })` |
| `app.view`                 | `app.canvas`                                    |
| `PIXI.` グローバル         | 名前付きimport                                  |

## カスタムフィルター vertex shader（実際の実装）

PixiJS v8 の `Filter` は vertex shader が**必須**。`GlProgram.from` ではなく `new GlProgram({ vertex, fragment })` を使用する:

```glsl
// PixiGrain.tsx で使用している vertex shader
in vec2 aPosition;
out vec2 vTextureCoord;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition(void) {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord(void) {
  return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

void main(void) {
  gl_Position = filterVertexPosition();
  vTextureCoord = filterTextureCoord();
}
```

`new GlProgram({ vertex, fragment })` で vertex/fragment 両方を渡す。
内蔵 uniform（`uInputSize`, `uOutputFrame`, `uOutputTexture` 等）は自動注入されるため `resources` での定義は不要。

## Grain フィルター（uTime アニメーション）

```glsl
// Fragment shader
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
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
  glProgram: new GlProgram({
    vertex: VERTEX_SHADER,
    fragment: FRAGMENT_SHADER,
  }),
  resources: {
    grainUniforms: {
      uIntensity: { value: intensity, type: "f32" },
      uTime: { value: 0, type: "f32" },
    },
  },
});

app.ticker.add((ticker) => {
  const resource = filter.resources["grainUniforms"];
  if (resource?.uniforms) {
    resource.uniforms.uTime += ticker.deltaTime * 0.01 * speed;
  }
});
```

## useEffect + destroyed フラグパターン（必須）

非同期セットアップの完了前にアンマウントされた場合の安全処理:

```typescript
"use client";

import { useEffect } from "react";
import { usePixiApp } from "./hooks/use-pixi-app";

export function PixiGrain({ intensity = 0.05, speed = 1.0 }) {
  const app = usePixiApp();

  useEffect(() => {
    let filter: import("pixi.js").Filter | null = null;
    let tickerCb: ((ticker: import("pixi.js").Ticker) => void) | null = null;
    let destroyed = false;

    const setup = async () => {
      const { Filter, GlProgram } = await import("pixi.js");
      if (destroyed) return; // 非同期完了前にアンマウントされた場合は中断

      const glProgram = new GlProgram({
        vertex: VERTEX_SHADER,
        fragment: FRAGMENT_SHADER,
      });
      filter = new Filter({
        glProgram,
        resources: {
          grainUniforms: {
            uIntensity: { value: intensity, type: "f32" },
            uTime: { value: 0, type: "f32" },
          },
        },
      });

      const existing = app.stage.filters;
      app.stage.filters = [
        ...(Array.isArray(existing) ? existing : []),
        filter,
      ];

      const tickerCallback = (ticker: import("pixi.js").Ticker) => {
        if (filter) {
          const resource = filter.resources["grainUniforms"];
          if (resource?.uniforms) {
            resource.uniforms.uTime += ticker.deltaTime * 0.01 * speed;
          }
        }
      };
      app.ticker.add(tickerCallback);
      tickerCb = tickerCallback;
    };

    void setup();

    return () => {
      destroyed = true;
      if (tickerCb) app.ticker.remove(tickerCb);
      if (filter) {
        if (Array.isArray(app.stage.filters)) {
          app.stage.filters = app.stage.filters.filter((f) => f !== filter);
        }
        filter.destroy();
      }
    };
  }, [app, intensity, speed]);

  return null; // DOMを返さない（PixiAppContextで親Canvasに描画）
}
```

## パーティクルスプライト決定的ハッシュ

```typescript
function deterministicHash(seed: number): number {
  let hash = seed;
  hash = ((hash >> 16) ^ hash) * 0x45d9f3b;
  hash = ((hash >> 16) ^ hash) * 0x45d9f3b;
  hash = (hash >> 16) ^ hash;
  return (hash & 0x7fffffff) / 0x7fffffff;
}
```

## Applicationの提供パターン（PixiAppContext）

`PixiCanvasInner` が `PixiAppContext.Provider` で `Application` インスタンスを子コンポーネントに提供。
フィルターコンポーネント（`PixiGrain`, `PixiVignette` 等）は `usePixiApp()` で取得する:

```typescript
// PixiCanvasInner 内部
<PixiAppContext.Provider value={app}>
  {children}
</PixiAppContext.Provider>

// フィルターコンポーネント内
const app = usePixiApp()  // hooks/use-pixi-app.ts
```

## フィルターライフサイクル

非同期セットアップ + `destroyed` フラグでマウント解除チェック。cleanup で ticker 除去 + フィルター配列から除去 + `filter.destroy()`。

## アンマウント時の Application 破棄

```typescript
// NG: オブジェクト形式（v7 API）
app.destroy({ removeView: true });

// OK: PixiCanvasInner の実装（boolean）
pixiApp.destroy(true); // removeView=true でcanvasをDOMから除去
```

## モバイル

PixiJS は L4 専用。モバイルでは**常に無効化**（`isMobile` ペナルティで L4 到達不可）。
フォールバック: CSS `radial-gradient` + noise テクスチャ。

## CLS対策

| 対策             | 実装                                                                                                    |
| ---------------- | ------------------------------------------------------------------------------------------------------- |
| Canvas初期サイズ | `absolute inset-0 z-[3]` で CLS 防止（z-index: `visual-effects-patterns.md` §Z-index ベースライン準拠） |
| CSS containment  | `contain: layout paint`                                                                                 |
| FPS自動劣化      | 60サンプル平均 < 30fps × 3回で L3 にダウングレード                                                      |
| 非表示時停止     | `IntersectionObserver`                                                                                  |
| 解放             | unmount時に `pixiApp.destroy(true)`                                                                     |

## GSAP ↔ PixiJS 統合要約

GSAP で PixiJS フィルターの uniform を直接制御:

```typescript
// gsap.to() で uniform をアニメーション
gsap.to(filter.resources["grainUniforms"].uniforms, {
  uIntensity: 0.08,
  duration: 1.5,
  ease: "power2.inOut",
});

// ScrollTrigger onUpdate → filter intensity
ScrollTrigger.create({
  trigger: ".section",
  scrub: true,
  onUpdate: (self) => {
    const uniforms = filter.resources["grainUniforms"].uniforms;
    uniforms.uIntensity = 0.02 + self.progress * 0.06;
  },
});
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
9. **v7 API の使用禁止** — `app.view` → `app.canvas`、`app.destroy({ removeView: true })` → `app.destroy(true)` 等

```typescript
// NG: トップレベルで同期 import（SSR クラッシュ）
import { Application } from "pixi.js";

// OK: useEffect 内で動的 import
useEffect(() => {
  const setup = async () => {
    const { Application } = await import("pixi.js");
    // ...
  };
  void setup();
}, []);
```

```typescript
// NG: destroyed チェックなし（アンマウント後も処理継続）
useEffect(() => {
  const setup = async () => {
    const { Application } = await import('pixi.js')
    const app = new Application()
    await app.init({ ... })
    // destroyed チェックがない！
  }
  void setup()
}, [])

// OK: destroyed フラグで安全にクリーンアップ
useEffect(() => {
  let destroyed = false
  const setup = async () => {
    const { Application } = await import('pixi.js')
    const app = new Application()
    await app.init({ ... })
    if (destroyed) { app.destroy(true); return }
    // 処理
  }
  void setup()
  return () => { destroyed = true }
}, [])
```

## ファイル配置

パスは `src/app/(public)/_shared/components/` を起点とした相対パス。

| パス                                    | 内容                                                   |
| --------------------------------------- | ------------------------------------------------------ |
| `effects/pixi/PixiCanvas.tsx`           | SSRゲート + L4チェック                                 |
| `effects/pixi/PixiCanvasInner.tsx`      | Application 初期化 + FPS監視 + PixiAppContext.Provider |
| `effects/pixi/PixiGrain.tsx`            | フィルムグレインGLSLフィルター                         |
| `effects/pixi/PixiVignette.tsx`         | ビネットGLSLフィルター                                 |
| `effects/pixi/PixiParticleSprites.tsx`  | 2Dボケパーティクル                                     |
| `effects/pixi/hooks/use-pixi-app.ts`    | PixiAppContext + `usePixiApp()` フック                 |
| `effects/pixi/hooks/use-pixi-scroll.ts` | Lenis → ref スクロール同期                             |

> **詳細パターン（共通頂点シェーダー、フィルターカタログ10種表、Vignette/Blur/Displacement/ColorMatrix/Scanline/Glow/Shockwave GLSLコード、フィルター組合せガイド、Graphics API表+ベジェ例、スクロール速度連動、スプライトアニメーション、インタラクティブパターン4種、テキストエフェクト、WebGPU、ui-ux-pro-maxマッピング）**: → `docs/reference/claude-rules/pixijs-reference.md`

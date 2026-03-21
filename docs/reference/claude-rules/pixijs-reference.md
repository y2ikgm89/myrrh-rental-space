# PixiJS パターン 詳細リファレンス

> このファイルは `.claude/rules/pixijs-patterns.md` の詳細セクション。
> コア原則とルールは `.claude/rules/pixijs-patterns.md` を参照。

## GLSL スタイル規約

本リファレンスのシェーダーコードは **GLSL 300 ES スタイル**（`finalColor`, `texture()`, `in`/`out`）で記述。
PixiJS v8 は内部で GLSL 1.0 スタイル（`gl_FragColor`, `texture2D`）を自動変換するため、どちらでも動作する。
公式サンプルは GLSL 1.0 スタイルが多いが、本プロジェクトでは GLSL 300 ES に統一。

**PixiJS 内蔵 uniform**: `uInputSize`, `uInputPixel`, `uInputClamp`, `uOutputFrame`, `uGlobalFrame` は
フィルターに自動注入されるため、`resources` での定義は不要（vertex shader での宣言のみ必要）。

## Vignette フィルター（静的 uniform）

```glsl
// フラグメントシェーダー
uniform float uIntensity;
uniform float uRadius;

void main(void) {
  vec4 color = texture(uTexture, vTextureCoord);
  float dist = distance(vTextureCoord, vec2(0.5));
  float vignette = smoothstep(uRadius, uRadius + 0.3, dist) * uIntensity;
  finalColor = vec4(color.rgb * (1.0 - vignette), color.a);
}
```

```typescript
// 静的 uniform（ticker 不要）
resources: {
  vignetteUniforms: {
    uIntensity: { value: 0.3, type: 'f32' },
    uRadius: { value: 0.7, type: 'f32' },
  },
}
```

## フィルターカタログ（統合一覧）

| フィルター       | uniform                            | アニメーション     | 用途                            | パフォーマンスコスト |
| ---------------- | ---------------------------------- | ------------------ | ------------------------------- | -------------------- |
| **Grain**        | uIntensity, uTime, uSpeed          | ticker (uTime更新) | フィルム質感、写真的テクスチャ  | Low                  |
| **Vignette**     | uIntensity, uRadius                | 静的               | 画面端の暗化、注視点誘導        | Very Low             |
| **Blur**         | uStrength, uDirection              | 静的 or ticker     | 被写界深度、フォーカス効果      | Medium（9タップ）    |
| **Displacement** | uIntensity, uTime                  | ticker             | 画像歪み、ホバーエフェクト      | Medium               |
| **ColorMatrix**  | uSaturation, uBrightness           | 静的               | 色調変換、モノクロ、セピア      | Very Low             |
| **Scanline**     | uIntensity, uCount, uTime          | ticker             | CRT演出、レトロ、サイバーパンク | Low                  |
| **Glow**         | uIntensity, uRadius, uColor        | 静的 or ticker     | ネオン、ハイライト強調、魔法    | Medium               |
| **Shockwave**    | uCenter, uTime, uSpeed, uAmplitude | ticker (1回再生)   | クリック波紋、衝撃波、遷移      | Medium               |
| **Outline**      | uColor, uThickness                 | 静的               | 選択UI、ホバー強調              | Low                  |
| **PixelSort**    | uIntensity, uAngle, uThreshold     | 静的               | グリッチアート、データモッシュ  | High                 |

## 追加フィルターパターン

### Blur フィルター（被写界深度風）

```typescript
const blurFilter = new Filter({
  glProgram,
  resources: {
    blurUniforms: {
      uStrength: { value: 2.0, type: "f32" },
      uDirection: { value: [1.0, 0.0], type: "vec2<f32>" },
    },
  },
});
```

```glsl
// フラグメントシェーダー: ガウシアンブラー（9タップ）
uniform float uStrength;
uniform vec2 uDirection;

void main(void) {
  vec2 dir = uDirection * uStrength * uInputSize.zw;
  vec4 color = vec4(0.0);
  color += texture(uTexture, vTextureCoord - 4.0 * dir) * 0.0162;
  color += texture(uTexture, vTextureCoord - 3.0 * dir) * 0.0540;
  color += texture(uTexture, vTextureCoord - 2.0 * dir) * 0.1216;
  color += texture(uTexture, vTextureCoord - 1.0 * dir) * 0.1945;
  color += texture(uTexture, vTextureCoord)              * 0.2270;
  color += texture(uTexture, vTextureCoord + 1.0 * dir) * 0.1945;
  color += texture(uTexture, vTextureCoord + 2.0 * dir) * 0.1216;
  color += texture(uTexture, vTextureCoord + 3.0 * dir) * 0.0540;
  color += texture(uTexture, vTextureCoord + 4.0 * dir) * 0.0162;
  finalColor = color;
}
```

### Displacement フィルター（画像歪み）

```glsl
uniform float uIntensity;
uniform float uTime;

void main(void) {
  vec2 uv = vTextureCoord;
  // 正弦波ベースの歪み
  float dx = sin(uv.y * 20.0 + uTime * 2.0) * uIntensity * 0.01;
  float dy = cos(uv.x * 20.0 + uTime * 1.5) * uIntensity * 0.01;
  finalColor = texture(uTexture, uv + vec2(dx, dy));
}
```

### ColorMatrix フィルター（色調変換）

```glsl
uniform float uSaturation;
uniform float uBrightness;

void main(void) {
  vec4 color = texture(uTexture, vTextureCoord);
  // 彩度調整
  float gray = dot(color.rgb, vec3(0.299, 0.587, 0.114));
  color.rgb = mix(vec3(gray), color.rgb, uSaturation);
  // 明度調整
  color.rgb *= uBrightness;
  finalColor = color;
}
```

### Scanline フィルター（CRTエフェクト）

```glsl
uniform float uIntensity;
uniform float uCount;
uniform float uTime;

void main(void) {
  vec4 color = texture(uTexture, vTextureCoord);
  // スキャンライン
  float scanline = sin(vTextureCoord.y * uCount + uTime * 5.0) * 0.5 + 0.5;
  color.rgb -= scanline * uIntensity;
  finalColor = color;
}
```

### Glow フィルター（ネオン/ハイライト）

```glsl
// フラグメントシェーダー
uniform float uIntensity;
uniform float uRadius;
uniform vec3 uColor;

void main(void) {
  vec4 color = texture(uTexture, vTextureCoord);

  // ガウシアンブラーでグロー生成
  vec4 glow = vec4(0.0);
  float total = 0.0;
  for (float x = -4.0; x <= 4.0; x += 1.0) {
    for (float y = -4.0; y <= 4.0; y += 1.0) {
      float weight = exp(-(x * x + y * y) / (2.0 * uRadius * uRadius));
      glow += texture(uTexture, vTextureCoord + vec2(x, y) * uInputSize.zw * uRadius) * weight;
      total += weight;
    }
  }
  glow /= total;

  // グロー合成（加算ブレンド）
  vec3 glowColor = glow.rgb * uColor * uIntensity;
  finalColor = vec4(color.rgb + glowColor, color.a);
}
```

```typescript
resources: {
  glowUniforms: {
    uIntensity: { value: 0.5, type: 'f32' },
    uRadius: { value: 3.0, type: 'f32' },
    uColor: { value: [1.0, 0.8, 0.2], type: 'vec3<f32>' },
  },
}
```

### Shockwave フィルター（衝撃波/遷移）

```glsl
// フラグメントシェーダー
uniform vec2 uCenter;
uniform float uTime;
uniform float uSpeed;
uniform float uAmplitude;
uniform float uWavelength;

void main(void) {
  vec2 uv = vTextureCoord;
  float dist = distance(uv, uCenter);
  float wave = uTime * uSpeed;

  // リング状の歪み
  float diff = abs(dist - wave);
  if (diff < uWavelength) {
    float factor = (1.0 - diff / uWavelength);
    float displacement = factor * uAmplitude * sin(factor * 3.14159);
    vec2 dir = normalize(uv - uCenter);
    uv += dir * displacement;
  }

  finalColor = texture(uTexture, uv);
}
```

```typescript
// クリック時に衝撃波を発射
const triggerShockwave = (x: number, y: number) => {
  const shockwaveUniforms = filter.resources["shockwaveUniforms"].uniforms;
  shockwaveUniforms.uCenter = [x / app.screen.width, y / app.screen.height];
  shockwaveUniforms.uTime = 0;

  // 1回再生（0→1で完了）
  app.ticker.add(function animate(ticker) {
    const currentTime =
      Number(shockwaveUniforms.uTime) +
      ticker.deltaTime * 0.02 * Number(shockwaveUniforms.uSpeed);
    shockwaveUniforms.uTime = currentTime;
    if (currentTime > 1.5) {
      app.ticker.remove(animate);
    }
  });
};
```

### フィルター組み合わせガイド

| 演出           | フィルター組み合わせ                   | 用途                           |
| -------------- | -------------------------------------- | ------------------------------ |
| フィルム風     | Grain + Vignette + ColorMatrix(低彩度) | ノスタルジック、写真的         |
| サイバーパンク | Scanline + ChromaticAberration + Grain | SF、テック系                   |
| 夢幻的         | Blur + Vignette + ColorMatrix(暖色)    | ラグジュアリー、幻想           |
| 歪み演出       | Displacement + Grain                   | インタラクティブ、マウス追従   |
| クリーン       | Vignette のみ                          | 写真ビューワー、ポートフォリオ |

## Graphics API 描画プリミティブ

| プリミティブ | メソッド                                 | 引数例                   |
| ------------ | ---------------------------------------- | ------------------------ |
| 円           | `graphics.circle(x, y, radius)`          | `(100, 100, 50)`         |
| 角丸矩形     | `graphics.roundRect(x, y, w, h, radius)` | `(0, 0, 200, 100, 16)`   |
| 楕円         | `graphics.ellipse(x, y, halfW, halfH)`   | `(100, 100, 80, 40)`     |
| 多角形       | `graphics.poly(points)`                  | `([0,0, 50,-80, 100,0])` |
| ベジェ曲線   | `graphics.moveTo().bezierCurveTo()`      | 制御点指定               |
| 線分         | `graphics.moveTo().lineTo()`             | `(x1,y1) → (x2,y2)`      |

### ベジェ曲線パターン（装飾的ライン）

```typescript
graphics
  .moveTo(0, 100)
  .bezierCurveTo(100, -50, 200, 250, 300, 100)
  .stroke({ color: 0xffffff, alpha: 0.3, width: 2 });

// 複数パスで有機的な形状
graphics
  .moveTo(150, 0)
  .bezierCurveTo(200, 50, 250, 100, 200, 150)
  .bezierCurveTo(150, 200, 100, 150, 150, 100)
  .bezierCurveTo(200, 50, 150, 0, 150, 0)
  .fill({ color: 0x88ccff, alpha: 0.15 });
```

## スクロール速度連動ドリフト

```typescript
const scrollVelocity = scrollRef.current.velocity;
const velocityFactor = Math.min(Math.abs(scrollVelocity) * 0.002, 1.5);

// 基本浮遊モーション + スクロール連動
const floatX = Math.sin(t * 0.5 + p.phase) * 20;
const driftX = p.speedX * velocityFactor * 30;
const driftY = p.speedY * velocityFactor * 20 + scrollVelocity * 0.05;

p.x = p.baseX + floatX + driftX;
```

## スプライトアニメーションパターン

### フレームアニメーション

```typescript
// スプライトシートからフレーム切替
const FRAME_COUNT = 12;
const FRAME_WIDTH = 64;
const FRAME_HEIGHT = 64;

app.ticker.add((ticker) => {
  frameIndex = (frameIndex + ticker.deltaTime * 0.2) % FRAME_COUNT;
  const col = Math.floor(frameIndex) % 4;
  const row = Math.floor(Math.floor(frameIndex) / 4);
  sprite.texture.frame = new Rectangle(
    col * FRAME_WIDTH,
    row * FRAME_HEIGHT,
    FRAME_WIDTH,
    FRAME_HEIGHT,
  );
});
```

## インタラクティブパターン

| パターン               | トリガー                   | 効果                               | 用途                           |
| ---------------------- | -------------------------- | ---------------------------------- | ------------------------------ |
| マウス追従パーティクル | `pointermove`              | カーソル周囲にパーティクル生成     | ポートフォリオ、ブランドサイト |
| ホバーリップル         | `pointerenter`             | ホバー位置から波紋拡大             | カード、ボタン、画像ギャラリー |
| クリックバースト       | `pointerdown`              | クリック位置から放射状パーティクル | CTA、インタラクティブ要素      |
| マウス歪み             | `pointermove` (continuous) | マウス位置に応じたDisplacement     | 写真ギャラリー、アート         |

### マウス追従パーティクル

```typescript
// マウス位置を追跡し、軌跡にパーティクルを生成
const MAX_TRAIL = 50;
const trailParticles: { x: number; y: number; alpha: number; size: number }[] =
  [];

const handlePointerMove = (e: PointerEvent) => {
  const rect = app.canvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  trailParticles.push({
    x,
    y,
    alpha: 0.8,
    size: 3 + deterministicHash(trailParticles.length) * 4,
  });

  if (trailParticles.length > MAX_TRAIL) {
    trailParticles.shift();
  }
};

// ticker で描画
app.ticker.add(() => {
  graphics.clear();
  for (const p of trailParticles) {
    p.alpha *= 0.95; // フェードアウト
    p.size *= 0.98; // 縮小
    if (p.alpha > 0.01) {
      graphics
        .circle(p.x, p.y, p.size)
        .fill({ color: 0xffffff, alpha: p.alpha });
    }
  }
  // 不可視パーティクルを除去
  while (trailParticles.length > 0 && trailParticles[0].alpha <= 0.01) {
    trailParticles.shift();
  }
});

app.canvas.addEventListener("pointermove", handlePointerMove);
```

### マウス歪みDisplacement

```typescript
// マウス位置をuniformに渡し、Displacementフィルターをリアルタイム更新
const handleMouseMove = (e: PointerEvent) => {
  const rect = app.canvas.getBoundingClientRect();
  const displacementUniforms =
    filter.resources["displacementUniforms"].uniforms;
  displacementUniforms.uMouseX = (e.clientX - rect.left) / rect.width;
  displacementUniforms.uMouseY = (e.clientY - rect.top) / rect.height;
};
```

```glsl
// フラグメント: マウス位置からの距離でdisplacement強度を減衰
uniform float uMouseX;
uniform float uMouseY;
uniform float uIntensity;
uniform float uRadius;

void main(void) {
  vec2 uv = vTextureCoord;
  vec2 mouse = vec2(uMouseX, uMouseY);
  float dist = distance(uv, mouse);
  float influence = smoothstep(uRadius, 0.0, dist);

  vec2 dir = normalize(uv - mouse);
  uv += dir * influence * uIntensity * 0.05;

  finalColor = texture(uTexture, uv);
}
```

## テキストエフェクトパターン

PixiJS のテキストレンダリング。GLSLフィルターとの組み合わせで高度なテキスト演出が可能。

| 手法                 | 特徴                                 | 用途                 |
| -------------------- | ------------------------------------ | -------------------- |
| `Text` + `TextStyle` | ビットマップテキスト（Canvas2D描画） | 一般的なテキスト表示 |
| `HTMLText`           | HTML/CSSベース（リッチテキスト対応） | 複雑なフォーマット   |
| `BitmapText`         | スプライトシートフォント（最速）     | ゲームUI、HUD        |

### TextStyle パターン

```typescript
import { Text, TextStyle } from "pixi.js";

const style = new TextStyle({
  fontFamily: '"Noto Sans JP", sans-serif',
  fontSize: 48,
  fontWeight: "700",
  fill: "#ffffff", // v8: 単色。グラデーションは FillGradient クラスを使用
  stroke: { color: "#000000", width: 2 },
  dropShadow: {
    alpha: 0.3,
    angle: Math.PI / 4,
    blur: 4,
    distance: 3,
    color: "#000000",
  },
  letterSpacing: 2,
  lineHeight: 60,
  wordWrap: true,
  wordWrapWidth: 600,
});

const text = new Text({ text: "PixiJS テキスト", style });
text.anchor.set(0.5);
text.position.set(app.screen.width / 2, app.screen.height / 2);
app.stage.addChild(text);
```

### テキスト + フィルター連携

```typescript
// テキストにGrainフィルターを適用（ヴィンテージ感）
text.filters = [grainFilter, vignetteFilter];

// テキスト個別のGlowフィルター
text.filters = [glowFilter];
```

## WebGPU 対応メモ

PixiJS v8 は WebGPU をサポート（`preference: 'webgpu'`）。
ただし、カスタムGLSLフィルターは WebGL 専用のため、WebGPU 使用時は WGSL シェーダーが必要。

```typescript
await pixiApp.init({
  // 'webgpu': WebGPU優先（非対応ブラウザではWebGLフォールバック）
  // 'webgl': WebGL固定（カスタムGLSLフィルター使用時はこちら）
  preference: "webgl", // GLSLフィルター使用のためWebGL固定
});
```

| レンダラー | シェーダー言語 | ブラウザ対応           | 推奨用途                   |
| ---------- | -------------- | ---------------------- | -------------------------- |
| WebGL      | GLSL           | 全モダンブラウザ       | カスタムフィルター使用時   |
| WebGPU     | WGSL           | Chrome 113+, Edge 113+ | 将来的な高性能レンダリング |

## ui-ux-pro-max スタイル対応

PixiJS フィルターと `ui-ux-pro-max` スタイルデータベースの対応関係。

### スタイル → PixiJS フィルター マッピング

| スタイル                       | PixiJS フィルター                          | uniform 設定                       | 演出意図           |
| ------------------------------ | ------------------------------------------ | ---------------------------------- | ------------------ |
| **Liquid Glass** (14)          | Blur + Displacement + ColorMatrix          | uStrength: 3, uIntensity: 0.15     | 流動的なガラス質感 |
| **Cyberpunk UI** (41)          | Scanline + Grain + ColorMatrix(高彩度)     | uCount: 800, uIntensity: 0.08      | CRT/ネオン演出     |
| **Retro-Futurism** (11)        | Scanline + Vignette + Grain                | uCount: 600, uIntensity: 0.06      | 80年代SF感         |
| **3D & Hyperrealism** (5)      | Grain + Vignette（微量）                   | uIntensity: 0.03, uRadius: 0.8     | 写実的テクスチャ   |
| **Motion-Driven** (15)         | Grain + Vignette                           | uIntensity: 0.04, uRadius: 0.75    | 映画的質感         |
| **Parallax Storytelling** (49) | Vignette + ColorMatrix（セクション別）     | セクション進行で切替               | 物語的雰囲気変化   |
| **E-Ink / Paper** (56)         | Grain(強) + ColorMatrix(低彩度) + Vignette | uIntensity: 0.08, uSaturation: 0.3 | 紙質感             |

### 検索コマンド例

```bash
# PixiJSフィルターに適したスタイルを調査
python3 .agents/skills/ui-ux-pro-max/scripts/search.py "film grain cinematic texture" --domain style

# フィルターエフェクトのUXガイドライン
python3 .agents/skills/ui-ux-pro-max/scripts/search.py "filter effect performance GPU" --domain ux
```

→ `.claude/skills/parallax-section/SKILL.md` の Step 1.5 で詳細な検索フローを参照

## GLSL シェーダー記述ガイド

### 共通ユニフォーム

| ユニフォーム      | 型          | 用途                 | 更新頻度               |
| ----------------- | ----------- | -------------------- | ---------------------- |
| `uTime`           | `f32`       | 経過時間             | 毎フレーム             |
| `uResolution`     | `vec2<f32>` | キャンバスサイズ     | リサイズ時             |
| `uMouse`          | `vec2<f32>` | マウス位置（正規化） | pointermove            |
| `uProgress`       | `f32`       | スクロール進行 0-1   | スクロール時           |
| `uScrollVelocity` | `f32`       | スクロール速度       | スクロール時           |
| `uIntensity`      | `f32`       | エフェクト強度       | 静的 or アニメーション |

### ノイズ関数

```glsl
// Hash（最軽量、パターンが見える）
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

// Value Noise（スムーズ、中コスト）
float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);  // smoothstep
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

// FBM（Fractal Brownian Motion、有機的パターン）
float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 5; i++) {
    value += amplitude * valueNoise(p);
    p *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}
```

### SDF 基礎

```glsl
// Circle SDF
float sdCircle(vec2 p, float r) {
  return length(p) - r;
}

// Box SDF
float sdBox(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

// Smooth Union
float opSmoothUnion(float d1, float d2, float k) {
  float h = clamp(0.5 + 0.5 * (d2 - d1) / k, 0.0, 1.0);
  return mix(d2, d1, h) - k * h * (1.0 - h);
}
```

### カラー空間操作

```glsl
// RGB → HSV
vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

// HSV → RGB
vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}
```

> **共通GLSLパターンの完全版**: → `docs/reference/claude-rules/shader-patterns-reference.md`

## 画像遷移エフェクト

### Displacement Map 遷移

```glsl
uniform sampler2D uTexture1;      // 遷移元画像
uniform sampler2D uTexture2;      // 遷移先画像
uniform sampler2D uDisplacement;  // ノイズマップ
uniform float uProgress;          // 0→1

void main(void) {
  vec2 uv = vTextureCoord;
  float disp = texture(uDisplacement, uv).r;

  vec2 uv1 = uv + vec2(disp * uProgress * 0.3, 0.0);
  vec2 uv2 = uv - vec2(disp * (1.0 - uProgress) * 0.3, 0.0);

  vec4 color1 = texture(uTexture1, uv1);
  vec4 color2 = texture(uTexture2, uv2);

  finalColor = mix(color1, color2, uProgress);
}
```

### Morph 遷移（UV歪みブレンド）

```glsl
uniform float uProgress;

void main(void) {
  vec2 uv = vTextureCoord;
  // 中心からの距離で歪み量を変化
  float dist = distance(uv, vec2(0.5));
  float warp = sin(dist * 10.0 - uProgress * 6.28) * 0.05 * uProgress;

  vec2 uv1 = uv + vec2(warp);
  vec2 uv2 = uv - vec2(warp);

  vec4 color1 = texture(uTexture1, uv1);
  vec4 color2 = texture(uTexture2, uv2);

  finalColor = mix(color1, color2, smoothstep(0.3, 0.7, uProgress));
}
```

### Dissolve（noise threshold）

```glsl
uniform float uProgress;

void main(void) {
  vec2 uv = vTextureCoord;
  float noise = hash(uv * 100.0 + vec2(uProgress));

  vec4 color1 = texture(uTexture1, uv);
  vec4 color2 = texture(uTexture2, uv);

  // ノイズ値がprogressを超えたら遷移先を表示
  float edge = smoothstep(uProgress - 0.05, uProgress + 0.05, noise);
  finalColor = mix(color2, color1, edge);
}
```

### Ripple/Wave 遷移

```glsl
uniform float uProgress;

void main(void) {
  vec2 uv = vTextureCoord;
  float wave = sin(uv.y * 30.0 + uProgress * 12.56) * 0.02 * sin(uProgress * 3.14);
  uv.x += wave;

  vec4 color1 = texture(uTexture1, uv);
  vec4 color2 = texture(uTexture2, uv);

  finalColor = mix(color1, color2, smoothstep(0.0, 1.0, uProgress));
}
```

### ギャラリー/カルーセル統合

```typescript
// uProgress を GSAP でアニメーション
function transitionToNext(filter: Filter) {
  const uniforms = filter.resources["transitionUniforms"].uniforms;
  uniforms.uProgress = 0;

  gsap.to(uniforms, {
    uProgress: 1,
    duration: 1.2,
    ease: "power2.inOut",
    onComplete: () => {
      // テクスチャ入れ替え: uTexture1 = uTexture2, 新画像を uTexture2 にセット
      swapTextures();
      uniforms.uProgress = 0;
    },
  });
}
```

## カスタムフラグメントシェーダー背景

### アニメーショングラデーション背景

```glsl
uniform float uTime;
uniform vec2 uResolution;

void main(void) {
  vec2 uv = vTextureCoord;
  vec3 color1 = vec3(0.1, 0.05, 0.2);   // ダークパープル
  vec3 color2 = vec3(0.05, 0.15, 0.3);  // ダークブルー
  vec3 color3 = vec3(0.2, 0.08, 0.15);  // ダークレッド

  float t = uTime * 0.1;
  float blend1 = sin(uv.x * 3.0 + t) * cos(uv.y * 2.0 - t * 0.7) * 0.5 + 0.5;
  float blend2 = cos(uv.x * 2.5 - t * 0.5) * sin(uv.y * 3.5 + t * 0.3) * 0.5 + 0.5;

  vec3 color = mix(mix(color1, color2, blend1), color3, blend2);
  finalColor = vec4(color, 1.0);
}
```

### ノイズベース有機的背景

```glsl
uniform float uTime;

void main(void) {
  vec2 uv = vTextureCoord;
  float n = fbm(uv * 3.0 + uTime * 0.1);
  float n2 = fbm(uv * 5.0 - uTime * 0.15);

  vec3 color = mix(
    vec3(0.05, 0.08, 0.15),  // ダークベース
    vec3(0.15, 0.12, 0.25),  // ハイライト
    n * n2
  );

  finalColor = vec4(color, 1.0);
}
```

### PixiJS shader vs CSS 判断テーブル

| 要件                          | PixiJS シェーダー | CSS                                     |
| ----------------------------- | ----------------- | --------------------------------------- |
| 静的グラデーション            | ❌ 過剰           | ✅ `linear-gradient`                    |
| アニメーション グラデーション | ✅ 滑らか         | ⚠️ `@property` + `@keyframes`（限定的） |
| ノイズベースパターン          | ✅ 唯一の選択     | ❌ 不可                                 |
| インタラクティブ反応          | ✅ マウス連動可   | ❌ 不可                                 |
| パフォーマンス（モバイル）    | ⚠️ GPU負荷        | ✅ 軽量                                 |
| L1 フォールバック必須         | —                 | ✅ 常に用意                             |

## シェーダーパフォーマンス最適化

### ブランチコスト（if/else 回避）

```glsl
// NG: GPU はブランチ予測が苦手
if (dist > 0.5) {
  color = vec3(1.0);
} else {
  color = vec3(0.0);
}

// OK: step/smoothstep で代替
color = vec3(step(0.5, dist));
color = vec3(smoothstep(0.45, 0.55, dist));  // アンチエイリアス付き
```

### テクスチャサンプリングバジェット

| フィルター     | サンプリング数 | コスト    | 目安                   |
| -------------- | -------------- | --------- | ---------------------- |
| 単純フィルター | 1              | Very Low  | 制限なし               |
| 5タップブラー  | 5              | Low       | 3フィルターまで        |
| 9タップブラー  | 9              | Medium    | 2フィルターまで        |
| ガウスグロー   | 81 (9×9)       | High      | 1フィルターまで        |
| マルチパス     | N×M            | Very High | 解像度スケーリング推奨 |

### 解像度スケーリング（半解像度レンダー + アップスケール）

```typescript
// PixiJS で半解像度レンダリング
await pixiApp.init({
  resolution: Math.min(window.devicePixelRatio, 2) * 0.5,  // 半解像度
  autoDensity: true,
})

// Three.js で DPR を制限
<Canvas dpr={[0.5, 1]} />  // 最大DPR 1.0
```

### ユニフォーム更新頻度

| 頻度         | 例                       | 最適化             |
| ------------ | ------------------------ | ------------------ |
| 毎フレーム   | `uTime`, `uMouse`        | 不可避だが最小限に |
| スクロール時 | `uProgress`, `uVelocity` | rAF 内でバッチ更新 |
| リサイズ時   | `uResolution`            | debounce (200ms)   |
| 静的         | `uIntensity`, `uColor`   | 初期化時のみ       |

## GSAP ↔ PixiJS タイムライン統合

### gsap.to(uniforms, { uIntensity: 1.0 })

```typescript
// GSAP で uniform を直接アニメーション
const uniforms = filter.resources["effectUniforms"].uniforms;

gsap.to(uniforms, {
  uIntensity: 0.08,
  duration: 2,
  ease: "power2.inOut",
});

gsap.fromTo(
  uniforms,
  { uIntensity: 0 },
  {
    uIntensity: 0.06,
    duration: 1.5,
    scrollTrigger: { trigger: ".section", scrub: true },
  },
);
```

### ScrollTrigger onUpdate → filter uniform マッピング

```typescript
ScrollTrigger.create({
  trigger: ".hero-section",
  start: "top top",
  end: "bottom top",
  scrub: true,
  onUpdate: (self) => {
    const uniforms = grainFilter.resources["grainUniforms"].uniforms;
    // 0% → 100% スクロールで grain が増加
    uniforms.uIntensity = 0.02 + self.progress * 0.06;

    const vignetteUniforms =
      vignetteFilter.resources["vignetteUniforms"].uniforms;
    // スクロールでビネット強度が変化
    vignetteUniforms.uIntensity = 0.15 + self.progress * 0.2;
  },
});
```

### タイムライン駆動フィルターシーケンス

```typescript
const tl = gsap.timeline({
  scrollTrigger: {
    trigger: ".story",
    start: "top top",
    end: "+=3000",
    pin: true,
    scrub: 1,
  },
});

// シーケンシャルにフィルター強度を変化
tl.to(grainUniforms, { uIntensity: 0.08, duration: 0.3 })
  .to(vignetteUniforms, { uIntensity: 0.4, duration: 0.3 }, "<")
  .to(colorUniforms, { uSaturation: 0.3, duration: 0.4 }, "+=0.2") // セピア風
  .to(colorUniforms, { uSaturation: 1.0, duration: 0.3 }); // 彩度復帰
```

### スクロール速度 → filter intensity 計算式

```typescript
// Lenis velocity → filter intensity マッピング
const MAX_INTENSITY = 0.15;
const VELOCITY_SCALE = 0.002;

app.ticker.add(() => {
  const velocity = Math.abs(scrollRef.current.velocity);
  const targetIntensity = Math.min(velocity * VELOCITY_SCALE, MAX_INTENSITY);

  // スムーズな補間（急激な変化を防止）
  currentIntensity += (targetIntensity - currentIntensity) * 0.1;
  uniforms.uIntensity = currentIntensity;
});
```

## 高度なフィルター合成

### マルチパスレンダリング

```typescript
// Pass 1: 水平ブラー
const hBlurFilter = new Filter({
  /* uDirection: [1, 0] */
});
// Pass 2: 垂直ブラー
const vBlurFilter = new Filter({
  /* uDirection: [0, 1] */
});

// 2パスで高品質ガウシアンブラー
container.filters = [hBlurFilter, vBlurFilter];
```

### RenderTexture 複合エフェクト

```typescript
import { RenderTexture } from "pixi.js";

// オフスクリーンレンダリング
const rt = RenderTexture.create({
  width: app.screen.width,
  height: app.screen.height,
});

// シーンをRenderTextureにレンダリング
app.renderer.render({ container: sourceContainer, target: rt });

// RenderTextureにフィルターを適用
const sprite = new Sprite(rt);
sprite.filters = [distortionFilter, bloomFilter];
app.stage.addChild(sprite);
```

### レイヤー別フィルター適用

```typescript
// 背景レイヤー: Grain + Vignette
bgContainer.filters = [grainFilter, vignetteFilter];

// コンテンツレイヤー: フィルターなし（テキスト可読性維持）
contentContainer.filters = [];

// 装飾レイヤー: Displacement + Glow
decoContainer.filters = [displacementFilter, glowFilter];
```

### 動的フィルター追加/除去（パフォーマンス考慮）

```typescript
// フィルターの動的追加
function addFilter(container: Container, filter: Filter) {
  container.filters = [...(container.filters ?? []), filter];
}

// フィルターの動的除去
function removeFilter(container: Container, filter: Filter) {
  container.filters = (container.filters ?? []).filter((f) => f !== filter);
  filter.destroy(); // リソース解放
}

// パフォーマンス考慮: フィルター数制限
const MAX_FILTERS = 4;
if ((container.filters?.length ?? 0) >= MAX_FILTERS) {
  console.warn("Filter limit reached, consider removing unused filters");
}
```

### ブレンドモード + フィルター組合せ

```typescript
// v8: ブレンドモードは文字列リテラル（BLEND_MODES enum は廃止）
glowSprite.blendMode = "add"; // 加算ブレンド
glowSprite.filters = [glowFilter];

overlaySprite.blendMode = "multiply"; // 乗算ブレンド
overlaySprite.filters = [colorMatrixFilter];

// v8 ブレンドモード一覧（文字列リテラル）
// 'normal', 'add', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'hard-light', 'soft-light'
```

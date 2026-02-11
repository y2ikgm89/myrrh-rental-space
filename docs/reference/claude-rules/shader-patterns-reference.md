# GLSL シェーダーパターン共通リファレンス

> Three.js (ShaderMaterial) / PixiJS (Filter) 共通の GLSL パターン集約。
> 個別ルール: `.claude/rules/threejs-patterns.md`, `.claude/rules/pixijs-patterns.md`
>
> **GLSL バージョン注意**: Three.js の ShaderMaterial は GLSL 300 ES（`#version 300 es`）を使用。
> PixiJS v8 の Filter は GLSL 1.0 スタイルを内部で自動変換するが、本プロジェクトでは GLSL 300 ES スタイルに統一。
> コード例は両フレームワーク共通で使用可能な構文で記述。

## ユニフォーム命名規約

| プレフィックス | 意味 | 例 |
|-------------|------|-----|
| `u` | ユニフォーム（外部から設定） | `uTime`, `uProgress`, `uColor` |
| `v` | varying（頂点→フラグメント受け渡し） | `vUv`, `vNormal`, `vPosition` |
| `a` | attribute（頂点属性） | `aPosition`, `aColor` |

### 共通ユニフォーム定義

| ユニフォーム | 型 | Three.js | PixiJS | 説明 |
|------------|-----|---------|--------|------|
| `uTime` | float | `uniforms.uTime.value += delta` | `uTime += ticker.deltaTime * 0.01` | 経過時間 |
| `uResolution` | vec2 | `[canvas.width, canvas.height]` | `uInputSize.xy` (PixiJS内蔵) | 画面サイズ |
| `uMouse` | vec2 | 手動正規化 | `[mouseX/width, mouseY/height]` | マウス位置(0-1) |
| `uProgress` | float | `scrollRef.current.progress` | `scrollRef.current.progress` | スクロール進行(0-1) |
| `uScrollVelocity` | float | `scrollRef.current.velocity` | `scrollRef.current.velocity` | スクロール速度 |
| `uIntensity` | float | uniform 直接設定 | `resources[].uniforms` | エフェクト強度 |

## ノイズ関数ライブラリ

### Hash（最軽量）

```glsl
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}

// 2D hash（vec2 出力）
vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}
```

**用途**: フィルムグレイン、簡易ランダムパターン。パターンが目視で分かるため、有機的な用途には不適。

### Value Noise

```glsl
float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);  // Hermite smoothstep
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
```

**用途**: 中程度の品質。テクスチャ歪み、有機的パターン。

### Simplex-lite（2D）

```glsl
// 簡略化 2D simplex noise（正確なsimplex noiseよりコスト低）
float simplex2d(vec2 p) {
  const float K1 = 0.366025404;  // (sqrt(3)-1)/2
  const float K2 = 0.211324865;  // (3-sqrt(3))/6
  vec2 i = floor(p + (p.x + p.y) * K1);
  vec2 a = p - i + (i.x + i.y) * K2;
  vec2 o = step(a.yx, a.xy);
  vec2 b = a - o + K2;
  vec2 c = a - 1.0 + 2.0 * K2;
  vec3 h = max(0.5 - vec3(dot(a, a), dot(b, b), dot(c, c)), 0.0);
  h = h * h * h * h;
  vec3 n = h * vec3(dot(a, hash2(i)), dot(b, hash2(i + o)), dot(c, hash2(i + 1.0)));
  return dot(n, vec3(70.0));
}
```

**用途**: 高品質な有機パターン。メタボール、流体、地形生成。

### FBM（Fractal Brownian Motion）

```glsl
float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  float frequency = 1.0;
  for (int i = 0; i < 5; i++) {    // オクターブ数（パフォーマンス注意）
    value += amplitude * valueNoise(p * frequency);
    frequency *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}

// Domain warping（FBMの入力をFBMで歪める）
float warpedFbm(vec2 p) {
  vec2 q = vec2(fbm(p), fbm(p + vec2(5.2, 1.3)));
  return fbm(p + q * 2.0);
}
```

**用途**: 雲、煙、大理石、有機的テクスチャ。オクターブ数が多いほどディテールが増すがコストも増加。

| オクターブ数 | コスト | ディテール | 推奨 |
|-----------|--------|----------|------|
| 3 | Low | 粗い | モバイル、リアルタイム |
| 5 | Medium | 標準 | デスクトップ |
| 8 | High | 精密 | 静的テクスチャ生成 |

## SDF（Signed Distance Functions）

### 基本プリミティブ

```glsl
// Circle
float sdCircle(vec2 p, float r) {
  return length(p) - r;
}

// Box
float sdBox(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}

// Rounded Box
float sdRoundedBox(vec2 p, vec2 b, float r) {
  vec2 d = abs(p) - b + r;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0) - r;
}

// Line Segment
float sdSegment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}
```

### 合成操作

```glsl
// Union（結合）
float opUnion(float d1, float d2) { return min(d1, d2); }

// Subtraction（減算）
float opSubtraction(float d1, float d2) { return max(-d1, d2); }

// Intersection（交差）
float opIntersection(float d1, float d2) { return max(d1, d2); }

// Smooth Union（滑らかな結合 — メタボール的）
float opSmoothUnion(float d1, float d2, float k) {
  float h = clamp(0.5 + 0.5 * (d2 - d1) / k, 0.0, 1.0);
  return mix(d2, d1, h) - k * h * (1.0 - h);
}

// Smooth Subtraction
float opSmoothSubtraction(float d1, float d2, float k) {
  float h = clamp(0.5 - 0.5 * (d2 + d1) / k, 0.0, 1.0);
  return mix(d2, -d1, h) + k * h * (1.0 - h);
}
```

### SDF レンダリング

```glsl
void main() {
  vec2 uv = (vTextureCoord - 0.5) * 2.0;  // -1 to 1 に正規化
  float d = sdCircle(uv - vec2(0.3, 0.0), 0.4);
  d = opSmoothUnion(d, sdCircle(uv + vec2(0.3, 0.0), 0.3), 0.2);

  // レンダリング: smoothstep でアンチエイリアス
  float alpha = 1.0 - smoothstep(0.0, 0.01, d);
  finalColor = vec4(vec3(0.2, 0.5, 0.8), alpha);
}
```

## カラー空間操作

### RGB ↔ HSV

```glsl
vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}
```

### OKLCH 近似

```glsl
// 簡易 OKLCH 近似（正確なOKLABではないが視覚的に近い）
vec3 oklchApprox(float L, float C, float H) {
  float a = C * cos(H * 6.28318);
  float b = C * sin(H * 6.28318);
  // 近似的なOKLAB→sRGB変換
  float l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  float m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  float s_ = L - 0.0894841775 * a - 1.2914855480 * b;
  float l = l_ * l_ * l_;
  float m = m_ * m_ * m_;
  float s = s_ * s_ * s_;
  return vec3(
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
   -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
   -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s
  );
}
```

## 頂点シェーダーパターン

### Displacement（波面変形）

```glsl
uniform float uTime;
uniform float uAmplitude;
uniform float uFrequency;

void main() {
  vec3 pos = position;
  pos.z += sin(pos.x * uFrequency + uTime) * uAmplitude;
  pos.z += cos(pos.y * uFrequency * 0.7 + uTime * 0.8) * uAmplitude * 0.5;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  vUv = uv;
}
```

### Morphing（2メッシュ間の形状補間）

```glsl
attribute vec3 targetPosition;  // モーフターゲット
uniform float uMorphProgress;   // 0-1

void main() {
  vec3 pos = mix(position, targetPosition, uMorphProgress);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
```

## フラグメントシェーダーパターン

### アニメーショングラデーション

```glsl
uniform float uTime;

void main() {
  vec2 uv = vUv;
  vec3 c1 = vec3(0.1, 0.05, 0.2);
  vec3 c2 = vec3(0.05, 0.15, 0.3);
  vec3 c3 = vec3(0.2, 0.08, 0.15);

  float t = uTime * 0.1;
  float b1 = sin(uv.x * 3.0 + t) * cos(uv.y * 2.0 - t) * 0.5 + 0.5;
  float b2 = cos(uv.x * 2.5 - t * 0.5) * sin(uv.y * 3.5 + t * 0.3) * 0.5 + 0.5;
  vec3 color = mix(mix(c1, c2, b1), c3, b2);
  gl_FragColor = vec4(color, 1.0);
}
```

### Noise 背景

```glsl
uniform float uTime;

void main() {
  vec2 uv = vUv;
  float n = fbm(uv * 4.0 + uTime * 0.1);
  vec3 color = mix(vec3(0.05, 0.08, 0.15), vec3(0.15, 0.12, 0.25), n);
  gl_FragColor = vec4(color, 1.0);
}
```

### Dissolve

```glsl
uniform float uProgress;
uniform sampler2D uTexture;

void main() {
  vec2 uv = vUv;
  float noise = fbm(uv * 8.0);
  float edge = smoothstep(uProgress - 0.05, uProgress + 0.05, noise);
  vec4 texColor = texture2D(uTexture, uv);
  gl_FragColor = vec4(texColor.rgb, texColor.a * edge);
}
```

### Ripple

```glsl
uniform float uTime;
uniform vec2 uCenter;

void main() {
  vec2 uv = vUv;
  float dist = distance(uv, uCenter);
  float ripple = sin(dist * 30.0 - uTime * 5.0) * 0.5 + 0.5;
  ripple *= smoothstep(0.5, 0.0, dist);  // 中心から減衰
  gl_FragColor = vec4(vec3(ripple * 0.2), ripple * 0.3);
}
```

## パフォーマンス最適化

### Branching

```glsl
// NG: GPU パイプラインストール
if (value > threshold) { result = a; } else { result = b; }

// OK: step/smoothstep/mix で代替
result = mix(b, a, step(threshold, value));
result = mix(b, a, smoothstep(threshold - 0.01, threshold + 0.01, value));
```

### Precision

```glsl
// モバイル対応: 明示的な精度宣言
precision mediump float;  // PixiJS デフォルト

// Three.js では ShaderChunk が精度を自動設定
// カスタムシェーダーで明示する場合:
// precision highp float;  // デスクトップ向け高精度
```

### テクスチャバジェット

| テクスチャ数 | パフォーマンス | 推奨 |
|-----------|-------------|------|
| 1-2 | Excellent | 制限なし |
| 3-4 | Good | デスクトップのみ |
| 5+ | Poor | 半解像度推奨 |

## デバッグツール

| ツール | 用途 | URL |
|--------|------|-----|
| Spector.js | WebGL コール追跡、シェーダーデバッグ | Chrome拡張 |
| WebGL Inspector | WebGL状態確認 | Chrome拡張 |
| RenderDoc | GPU キャプチャ（ネイティブ） | renderdoc.org |
| PixiJS DevTools | PixiJS ステージ/フィルター確認 | Chrome拡張 |
| Three.js Editor | シーン確認 | threejs.org/editor |

### シェーダーデバッグパターン

```glsl
// 値の可視化（色で確認）
finalColor = vec4(vec3(uProgress), 1.0);  // progressを白黒で表示
finalColor = vec4(vUv, 0.0, 1.0);         // UV座標を色で表示
finalColor = vec4(abs(normal), 1.0);       // 法線を色で表示
```

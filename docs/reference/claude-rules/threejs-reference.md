# Three.js パターン 詳細リファレンス

> このファイルは `.claude/rules/threejs-patterns.md` の詳細セクション。
> コア原則とルールは `.claude/rules/threejs-patterns.md` を参照。

## マテリアルカタログ

| マテリアル | 特徴 | 用途 | パフォーマンス |
|-----------|------|------|-------------|
| `meshBasicMaterial` | ライティング不要、フラット | ワイヤフレーム、パーティクル、背景 | Excellent |
| `meshStandardMaterial` | PBR、金属/粗さ | リアルなオブジェクト、プロダクト表示 | Moderate |
| `meshPhysicalMaterial` | Standard拡張、透過/クリアコート | ガラス、車、液体 | Poor |
| `meshToonMaterial` | セルシェーディング | イラスト風、ゲーム的表現 | Good |
| `meshNormalMaterial` | 法線カラー表示 | デバッグ、抽象的表現 | Excellent |
| `MeshDistortMaterial` (drei) | 頂点歪み + 速度制御 | 有機的な形状、流体風 | Moderate |
| `MeshWobbleMaterial` (drei) | 頂点揺れ + 周波数制御 | ゼリー、フラグ、柔らかい物体 | Moderate |
| `MeshTransmissionMaterial` (drei) | 透過 + 屈折 + 歪み | ガラス球、水晶、レンズ | Poor |

### ガラスマテリアル例（MeshTransmissionMaterial）

```typescript
import { MeshTransmissionMaterial } from '@react-three/drei'

function GlassSphere() {
  return (
    <mesh>
      <sphereGeometry args={[1, 64, 64]} />
      <MeshTransmissionMaterial
        backside
        samples={4}
        thickness={0.5}
        chromaticAberration={0.2}
        anisotropy={0.3}
        distortion={0.5}
        distortionScale={0.3}
        temporalDistortion={0.1}
        roughness={0}
      />
    </mesh>
  )
}
```

## ジオメトリカタログ

| ジオメトリ | 引数例 | 用途 | ポリゴン数 |
|-----------|-------|------|----------|
| `sphereGeometry` | `[1, 32, 32]` | パーティクル、惑星、装飾 | 中 |
| `planeGeometry` | `[10, 10, 32, 32]` | 背景面、波面、地形 | 可変 |
| `torusKnotGeometry` | `[1, 0.3, 128, 32]` | 抽象オブジェクト、ロゴ | 高 |
| `boxGeometry` | `[1, 1, 1]` | 建築表現、キューブ | 低 |
| `icosahedronGeometry` | `[1, 1]` | ローポリ球体、結晶 | 低 |
| `cylinderGeometry` | `[0.5, 0.5, 2, 32]` | 柱、ピン、UI要素 | 中 |
| `bufferGeometry` (カスタム) | Position属性直接操作 | 波面、地形、データ可視化 | 完全制御 |

### カスタムBufferGeometry（波面）

```typescript
function WavePlane({ width = 10, segments = 64, color = 'var(--color-primary)' }: { width?: number; segments?: number; color?: string }) {
  const meshRef = useRef<THREE.Mesh>(null)
  const scrollRef = useScrollRef()

  const geometry = useMemo(() => {
    const geo = new THREE.PlaneGeometry(width, width, segments, segments)
    return geo
  }, [width, segments])

  useFrame((_state, delta) => {
    const mesh = meshRef.current
    if (!mesh) return
    const positions = mesh.geometry.attributes.position
    if (!positions) return

    const time = _state.clock.elapsedTime
    const progress = scrollRef.current.progress

    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i)
      const y = positions.getY(i)
      const wave = Math.sin(x * 0.5 + time) * Math.cos(y * 0.5 + time) * 0.3
      positions.setZ(i, wave * (1 + progress * 0.5))
    }
    positions.needsUpdate = true
  })

  return (
    <mesh ref={meshRef} geometry={geometry} rotation={[-Math.PI / 4, 0, 0]}>
      <meshBasicMaterial color={color} wireframe transparent opacity={0.15} />
    </mesh>
  )
}
```

## Drei Float コンポーネント

自動浮遊アニメーション付きラッパー。

```typescript
<Float
  speed={1.5}              // 浮遊速度
  rotationIntensity={1}    // 回転の強さ
  floatIntensity={1}       // 浮遊の振幅
>
  <mesh>...</mesh>
</Float>
```

### Drei コンポーネントカタログ

| カテゴリ | コンポーネント | 用途 |
|---------|-------------|------|
| **アニメーション** | `Float` | 自動浮遊（速度/回転/振幅制御） |
| | `Trail` | オブジェクト追従軌跡（光の軌跡、彗星） |
| | `MarchingCubes` | メタボール（有機的な融合形状） |
| **テキスト** | `Text` | SDF 3Dテキスト（troika-three-text） |
| | `Text3D` | 押し出し3Dテキスト（フォントJSON必須） |
| **パーティクル** | `Sparkles` | 簡易パーティクル（星屑、ほこり） |
| | `Stars` | 星空背景 |
| **環境** | `Environment` | HDR環境マップ（プリセット: sunset, studio, city等） |
| | `Sky` | 手続き的空（太陽位置制御） |
| | `Cloud` | ボリュメトリッククラウド |
| **ユーティリティ** | `Html` | 3D空間にHTML要素を配置 |
| | `Billboard` | 常にカメラを向くオブジェクト |
| | `Mask` | ステンシルマスク |
| **パフォーマンス** | `Preload` | アセットプリロード |
| | `BakeShadows` | 影の事前ベイク |
| | `AdaptiveDpr` | DPR自動調整 |

### ライティングレシピ

| レシピ | ライト構成 | 効果 | 用途 |
|--------|-----------|------|------|
| **スタジオ** | Ambient(0.4) + Directional(1.0, 斜め上) + Fill(0.3, 反対側) | クリーンで均一 | プロダクト、ポートフォリオ |
| **ドラマチック** | Ambient(0.1) + Spot(1.5, 狭角) + Rim(0.8, 背面) | 高コントラスト | ブランド、アート |
| **アウトドア** | Hemisphere(sky/ground) + Directional(太陽角度) | 自然光 | 建築、ランドスケープ |
| **アンビエント** | Ambient(0.6) のみ or Environment(preset) | フラット、均一 | 抽象、ワイヤフレーム |

### スタジオライティング例

```typescript
function StudioLighting() {
  return (
    <>
      <ambientLight intensity={0.4} />
      <directionalLight
        position={[5, 8, 3]}
        intensity={1.0}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      {/* フィルライト（反対側から柔らかく） */}
      <directionalLight
        position={[-3, 2, -2]}
        intensity={0.3}
        color="#e8e0ff"
      />
      {/* リムライト（背面から輪郭強調） */}
      <pointLight
        position={[0, 3, -5]}
        intensity={0.8}
        color="#fff0e0"
      />
    </>
  )
}
```

## オンデマンドレンダリング

`frameloop="demand"` でレンダリングを必要時のみに制限。`invalidate()` で手動トリガー。

```typescript
// Canvas をオンデマンドに設定
<Canvas frameloop="demand">
  <AnimatedMesh />
</Canvas>

// コンポーネント内で手動レンダリング要求
function AnimatedMesh() {
  const { invalidate } = useThree()

  useEffect(() => {
    // 外部イベントでレンダリングをトリガー
    controls.addEventListener('change', invalidate)
    return () => controls.removeEventListener('change', invalidate)
  }, [invalidate])
}
```

**注意**: 背景エフェクトCanvasは `frameloop="always"` を使用（スクロール連動のため常時更新が必要）。

## パフォーマンスリグレッション

```typescript
function PerformanceHandler() {
  const { performance, invalidate } = useThree()

  const handleComplexOperation = () => {
    performance.regress()       // パフォーマンス低下を通知
    invalidate()                // 再レンダリングを要求（frameloop="demand" 時）
  }
}
```

## PostProcessing / EffectComposer

### @react-three/postprocessing 統合

```typescript
import { EffectComposer, Bloom, ChromaticAberration, Noise } from '@react-three/postprocessing'
import { BlendFunction } from 'postprocessing'

function PostEffects({ intensity = 0.5 }: { intensity: number }) {
  return (
    <EffectComposer>
      <Bloom
        luminanceThreshold={0.9}
        luminanceSmoothing={0.025}
        intensity={intensity}
      />
      <ChromaticAberration
        offset={[0.002, 0.002]}
        blendFunction={BlendFunction.NORMAL}
      />
      <Noise
        opacity={0.02}
        blendFunction={BlendFunction.OVERLAY}
      />
    </EffectComposer>
  )
}
```

### スクロール連動エフェクト強度

```typescript
import { BloomEffect } from 'postprocessing'

function ScrollPostEffects() {
  const scrollRef = useScrollRef()
  const bloomRef = useRef<BloomEffect>(null)

  useFrame(() => {
    if (!bloomRef.current) return
    const velocity = Math.abs(scrollRef.current.velocity)
    // スクロール速度でブルーム強度を動的変更
    bloomRef.current.intensity = 0.3 + velocity * 0.005
  })

  return (
    <EffectComposer>
      <Bloom ref={bloomRef} luminanceThreshold={0.9} intensity={0.3} />
    </EffectComposer>
  )
}
```

## カスタム ShaderMaterial

### 基本パターン

```typescript
import { shaderMaterial } from '@react-three/drei'
import { extend, useFrame } from '@react-three/fiber'

const WaveMaterial = shaderMaterial(
  // uniforms
  { uTime: 0, uColor: new THREE.Color(0x00ff00), uProgress: 0 },
  // vertex shader
  `
    varying vec2 vUv;
    uniform float uTime;
    void main() {
      vUv = uv;
      vec3 pos = position;
      pos.z += sin(pos.x * 3.0 + uTime) * 0.1;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    }
  `,
  // fragment shader
  `
    varying vec2 vUv;
    uniform vec3 uColor;
    uniform float uProgress;
    void main() {
      float alpha = smoothstep(0.0, 0.1, vUv.y) * smoothstep(1.0, 0.9, vUv.y);
      gl_FragColor = vec4(uColor, alpha * uProgress);
    }
  `,
)

extend({ WaveMaterial })

// JSX で使用
function WavePlane() {
  const materialRef = useRef<THREE.ShaderMaterial>(null)
  const scrollRef = useScrollRef()

  useFrame((_state, delta) => {
    if (!materialRef.current) return
    materialRef.current.uniforms.uTime.value += delta
    materialRef.current.uniforms.uProgress.value = scrollRef.current.progress
  })

  return (
    <mesh>
      <planeGeometry args={[10, 5, 32, 32]} />
      {/* @ts-expect-error -- drei shaderMaterial extend */}
      <waveMaterial ref={materialRef} transparent />
    </mesh>
  )
}
```

### 画像歪みシェーダー

```typescript
const DistortMaterial = shaderMaterial(
  { uTexture: new THREE.Texture(), uProgress: 0, uIntensity: 0.3 },
  // vertex
  `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  // fragment
  `
    varying vec2 vUv;
    uniform sampler2D uTexture;
    uniform float uProgress;
    uniform float uIntensity;
    void main() {
      vec2 uv = vUv;
      // スクロール進行に応じた歪み
      uv.x += sin(uv.y * 10.0 + uProgress * 6.28) * uIntensity * uProgress;
      uv.y += cos(uv.x * 10.0 + uProgress * 6.28) * uIntensity * uProgress * 0.5;
      gl_FragColor = texture2D(uTexture, uv);
    }
  `,
)
```

### 頂点ディスプレースメント（波面）

```glsl
// vertex shader
varying vec2 vUv;
uniform float uTime;
uniform float uAmplitude;
uniform float uFrequency;

void main() {
  vUv = uv;
  vec3 pos = position;
  // 正弦波ディスプレースメント
  pos.z += sin(pos.x * uFrequency + uTime) * uAmplitude;
  pos.z += cos(pos.y * uFrequency * 0.7 + uTime * 0.8) * uAmplitude * 0.5;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
```

### ノイズカラー（有機的グラデーション）

```glsl
// fragment shader
varying vec2 vUv;
uniform float uTime;
uniform vec3 uColor1;
uniform vec3 uColor2;

// Simplex noise（簡略版）
float noise(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float smoothNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = noise(i);
  float b = noise(i + vec2(1.0, 0.0));
  float c = noise(i + vec2(0.0, 1.0));
  float d = noise(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

void main() {
  float n = smoothNoise(vUv * 3.0 + uTime * 0.2);
  vec3 color = mix(uColor1, uColor2, n);
  gl_FragColor = vec4(color, 1.0);
}
```

## ScrollScene パターン

スクロール進行に応じて3Dシーン全体を制御するパターン。

```typescript
function ScrollScene() {
  const groupRef = useRef<THREE.Group>(null)
  const scrollRef = useScrollRef()

  useFrame(() => {
    const group = groupRef.current
    if (!group) return

    const { progress, velocity } = scrollRef.current
    // スクロール進行でカメラ回転・移動
    group.rotation.y = progress * Math.PI * 0.5
    group.position.y = -progress * 3
    // 速度でスケール微変動
    const s = 1 + Math.abs(velocity) * 0.0005
    group.scale.setScalar(s)
  })

  return (
    <group ref={groupRef}>
      <FloatingGeometry />
      <ParticleField count={80} spread={8} />
    </group>
  )
}
```

## ui-ux-pro-max スタイル対応

Three.js パターンと `ui-ux-pro-max` スタイルデータベースの対応関係。

### スタイル → Three.js パターン マッピング

| スタイル | Three.js パターン | 推奨コンポーネント | パフォーマンス |
|---------|-----------------|------------------|-------------|
| **3D & Hyperrealism** (5) | ParticleField + FloatingGeometry + PostProcessing | InstancedMesh, Bloom, ChromaticAberration | Poor — L3+必須 |
| **Spatial UI / VisionOS** (55) | Float + 深度レイヤー + ブラー | Float, DepthOfField, Parallax | Moderate |
| **Motion-Driven** (15) | ScrollScene + スクロール連動 | ScrollScene, useFrame velocity | Good |
| **Liquid Glass** (14) | カスタムShader + 屈折 | ShaderMaterial, MeshTransmissionMaterial | Moderate-Poor |
| **Parallax Storytelling** (49) | ScrollScene + 段階的カメラ移動 | useFrame progress, camera path | Good |
| **Dimensional Layering** (46) | Z軸レイヤー + 深度ボケ | DepthOfField, group positioning | Good |
| **Biomimetic / Organic** (58) | パーティクル + 流体シム | InstancedMesh, custom shader | Poor |

### 検索コマンド例

```bash
# Three.js に適したスタイルを調査
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "3D immersive depth WebGL" --domain style

# 3D UXガイドライン
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "3D performance WebGL" --domain ux

# Next.js での3D最適化
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "3D lazy loading WebGL" --stack nextjs
```

-> `.claude/skills/parallax-section/SKILL.md` の Step 1.5 で詳細な検索フローを参照

## GSAP ↔ Three.js 統合パターン

### ScrollTrigger → カメラ position/rotation

```typescript
function ScrollCamera() {
  const scrollRef = useScrollRef()
  const { camera } = useThree()

  useFrame(() => {
    const { progress } = scrollRef.current
    camera.position.z = 5 - progress * 3
    camera.position.y = progress * 2
    camera.rotation.x = -progress * 0.3
  })

  return null
}
```

### ScrollTrigger → shader uniform 制御

```typescript
function ScrollShader() {
  const materialRef = useRef<THREE.ShaderMaterial>(null)
  const scrollRef = useScrollRef()

  useFrame((_state, delta) => {
    if (!materialRef.current) return
    materialRef.current.uniforms.uProgress.value = scrollRef.current.progress
    materialRef.current.uniforms.uTime.value += delta
  })

  return (
    <mesh>
      <planeGeometry args={[10, 10, 32, 32]} />
      {/* @ts-expect-error -- drei shaderMaterial extend */}
      <waveMaterial ref={materialRef} transparent />
    </mesh>
  )
}
```

### タイムライン駆動カメラパス（ウェイポイント配列）

```typescript
const WAYPOINTS = [
  { pos: [0, 0, 5], lookAt: [0, 0, 0] },
  { pos: [3, 2, 4], lookAt: [0, 1, 0] },
  { pos: [-2, 1, 3], lookAt: [1, 0, -1] },
  { pos: [0, 3, 2], lookAt: [0, 0, 0] },
] as const

function CameraPath() {
  const scrollRef = useScrollRef()
  const { camera } = useThree()
  const target = useMemo(() => new THREE.Vector3(), [])
  const lookTarget = useMemo(() => new THREE.Vector3(), [])

  useFrame(() => {
    const t = scrollRef.current.progress * (WAYPOINTS.length - 1)
    const i = Math.floor(t)
    const f = t - i
    const from = WAYPOINTS[Math.min(i, WAYPOINTS.length - 1)]
    const to = WAYPOINTS[Math.min(i + 1, WAYPOINTS.length - 1)]

    // 位置補間
    target.set(...from.pos).lerp(new THREE.Vector3(...to.pos), f)
    camera.position.copy(target)

    // 注視点補間
    lookTarget.set(...from.lookAt).lerp(new THREE.Vector3(...to.lookAt), f)
    camera.lookAt(lookTarget)
  })

  return null
}
```

### セクション別3Dシーン切替

```typescript
function SectionScene() {
  const scrollRef = useScrollRef()
  const activeSceneRef = useRef<'intro' | 'features' | 'cta'>('intro')
  const introRef = useRef<THREE.Group>(null)
  const featuresRef = useRef<THREE.Group>(null)
  const ctaRef = useRef<THREE.Group>(null)

  useFrame(() => {
    const p = scrollRef.current.progress
    // useFrame 内では ref で制御（setState 禁止）
    const next = p < 0.33 ? 'intro' : p < 0.66 ? 'features' : 'cta'
    if (next !== activeSceneRef.current) {
      activeSceneRef.current = next
      if (introRef.current) introRef.current.visible = next === 'intro'
      if (featuresRef.current) featuresRef.current.visible = next === 'features'
      if (ctaRef.current) ctaRef.current.visible = next === 'cta'
    }
  })

  return (
    <group>
      <group ref={introRef}><IntroScene /></group>
      <group ref={featuresRef} visible={false}><FeaturesScene /></group>
      <group ref={ctaRef} visible={false}><CTAScene /></group>
    </group>
  )
}
```

## モデルローディングパターン

### useGLTF + Suspense

```typescript
import { useGLTF } from '@react-three/drei'
import { Suspense } from 'react'

function SpaceModel({ url }: { url: string }) {
  const { scene, nodes, materials } = useGLTF(url)
  return <primitive object={scene} scale={0.5} />
}

// プリロード（LCP最適化）
useGLTF.preload('/models/space.glb')

// Suspense ラッパー
<Suspense fallback={<mesh><boxGeometry /><meshBasicMaterial wireframe /></mesh>}>
  <SpaceModel url="/models/space.glb" />
</Suspense>
```

### Draco 圧縮セットアップ

```typescript
import { useGLTF } from '@react-three/drei'

// Draco デコーダーパスを設定（CDNまたはローカル）
useGLTF.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/')

function CompressedModel() {
  const { scene } = useGLTF('/models/compressed.glb')
  return <primitive object={scene} />
}
```

### GLTFモデル最適化チェックリスト

| 項目 | 推奨値 | 理由 |
|------|--------|------|
| ポリゴン数 | < 50K | モバイル対応 |
| テクスチャサイズ | ≤ 2048px | VRAM節約 |
| テクスチャ形式 | WebP / Basis | 転送サイズ削減 |
| Draco圧縮 | 有効 | 転送サイズ50-90%削減 |
| ファイル形式 | .glb | .gltf + 別ファイルより効率的 |
| アニメーション | Baked | ランタイム負荷削減 |

### Cloneパターン（複数インスタンス）

```typescript
function ModelInstance({ position }: { position: [number, number, number] }) {
  const { scene } = useGLTF('/models/tree.glb')
  const clone = useMemo(() => scene.clone(), [scene])
  return <primitive object={clone} position={position} />
}

// 複数配置
{positions.map((pos, i) => <ModelInstance key={i} position={pos} />)}
```

### モデルアニメーション + スクロール制御

```typescript
import { useGLTF, useAnimations } from '@react-three/drei'

function AnimatedModel() {
  const group = useRef<THREE.Group>(null)
  const { scene, animations } = useGLTF('/models/animated.glb')
  const { actions, mixer } = useAnimations(animations, group)
  const scrollRef = useScrollRef()

  useEffect(() => {
    const action = actions['Walk']
    if (action) {
      action.play()
      action.paused = true  // 手動制御のため一時停止
    }
  }, [actions])

  useFrame(() => {
    if (!mixer) return
    // スクロール進行でアニメーション時間を制御
    const clip = animations[0]
    if (clip) {
      mixer.setTime(scrollRef.current.progress * clip.duration)
    }
  })

  return <primitive ref={group} object={scene} />
}
```

## ポストプロセッシング拡張

### DOF（Bokeh）+ スクロール連動 focus distance

```typescript
import { DepthOfField } from '@react-three/postprocessing'

function ScrollDOF() {
  const dofRef = useRef(null)
  const scrollRef = useScrollRef()

  useFrame(() => {
    if (!dofRef.current) return
    // スクロール進行でフォーカス距離を変更
    dofRef.current.target = 2 + scrollRef.current.progress * 5
  })

  return (
    <EffectComposer>
      <DepthOfField
        ref={dofRef}
        focusDistance={0}
        focalLength={0.02}
        bokehScale={6}
      />
    </EffectComposer>
  )
}
```

### Selective Bloom（emissive + luminance threshold）

```typescript
<EffectComposer>
  <Bloom
    luminanceThreshold={0.8}    // 高い閾値で明るい部分のみ
    luminanceSmoothing={0.1}
    intensity={0.6}
    mipmapBlur
  />
</EffectComposer>

// emissive マテリアルでブルーム対象を制御
<meshStandardMaterial
  color="#111"
  emissive="#4488ff"
  emissiveIntensity={2}      // 閾値を超える明るさ
/>
```

### カスタムPass パターン

```typescript
import { Effect } from 'postprocessing'

class CustomVignetteEffect extends Effect {
  constructor({ intensity = 0.5 } = {}) {
    super('CustomVignette', `
      uniform float intensity;
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        float dist = distance(uv, vec2(0.5));
        float vignette = smoothstep(0.5, 0.2, dist) * intensity;
        outputColor = vec4(inputColor.rgb * (1.0 - vignette * 0.5), inputColor.a);
      }
    `, {
      uniforms: new Map([['intensity', new THREE.Uniform(intensity)]]),
    })
  }
}
```

### エフェクト別パフォーマンスコスト

| エフェクト | コスト | フルHDでの影響 | 推奨使用場面 |
|-----------|--------|-------------|------------|
| Bloom | Medium | -5~10fps | Hero、ハイライト強調 |
| ChromaticAberration | Low | -2fps | 速度感、グリッチ |
| DepthOfField | High | -10~15fps | フォーカス演出、映画的 |
| Noise | Very Low | -1fps | フィルム質感（常時OK） |
| Vignette | Very Low | -1fps | 注視点誘導（常時OK） |
| SSAO | Very High | -15~20fps | 奥行き強調（L3+のみ） |

### エフェクト順序ベストプラクティス

```typescript
<EffectComposer>
  {/* 1. ジオメトリ依存エフェクト */}
  <SSAO />
  <DepthOfField />
  {/* 2. 色調エフェクト */}
  <Bloom />
  <ChromaticAberration />
  {/* 3. スクリーン全体エフェクト */}
  <Noise />
  <Vignette />
</EffectComposer>
```

## スクロール連動カメラパス

### ウェイポイント補間（Vector3 lerp）

```typescript
const CAMERA_POINTS = [
  new THREE.Vector3(0, 0, 10),
  new THREE.Vector3(5, 2, 7),
  new THREE.Vector3(-3, 4, 5),
  new THREE.Vector3(0, 1, 3),
]

function WaypointCamera() {
  const scrollRef = useScrollRef()
  const { camera } = useThree()
  const temp = useMemo(() => new THREE.Vector3(), [])

  useFrame(() => {
    const t = scrollRef.current.progress * (CAMERA_POINTS.length - 1)
    const i = Math.floor(t)
    const f = t - i
    const from = CAMERA_POINTS[Math.min(i, CAMERA_POINTS.length - 1)]
    const to = CAMERA_POINTS[Math.min(i + 1, CAMERA_POINTS.length - 1)]

    temp.lerpVectors(from, to, f)
    camera.position.copy(temp)
    camera.lookAt(0, 0, 0)
  })

  return null
}
```

### CatmullRomCurve3 スムーズパス

```typescript
const curve = useMemo(() => new THREE.CatmullRomCurve3([
  new THREE.Vector3(0, 0, 10),
  new THREE.Vector3(5, 3, 7),
  new THREE.Vector3(8, 1, 3),
  new THREE.Vector3(3, 4, 0),
  new THREE.Vector3(0, 2, -3),
], false, 'catmullrom', 0.5), [])

function SmoothCamera() {
  const scrollRef = useScrollRef()
  const { camera } = useThree()
  const point = useMemo(() => new THREE.Vector3(), [])

  useFrame(() => {
    curve.getPointAt(scrollRef.current.progress, point)
    camera.position.copy(point)
    camera.lookAt(0, 0, 0)
  })

  return null
}
```

### lookAt ターゲット補間

```typescript
const lookCurve = useMemo(() => new THREE.CatmullRomCurve3([
  new THREE.Vector3(0, 0, 0),
  new THREE.Vector3(2, 1, -2),
  new THREE.Vector3(-1, 0, -5),
], false, 'catmullrom', 0.5), [])

function CameraWithLookAt() {
  const scrollRef = useScrollRef()
  const { camera } = useThree()
  const lookTarget = useMemo(() => new THREE.Vector3(), [])

  useFrame(() => {
    const t = scrollRef.current.progress
    curve.getPointAt(t, camera.position)
    lookCurve.getPointAt(t, lookTarget)
    camera.lookAt(lookTarget)
  })

  return null
}
```

## ジオメトリインスタンシング & LOD

### InstancedMesh vs 個別メッシュ判断基準

| 基準 | InstancedMesh | 個別メッシュ |
|------|--------------|------------|
| 同一ジオメトリ + マテリアル | ✅ 1ドローコール | ❌ N ドローコール |
| 個別アニメーション必要 | ⚠️ matrix更新必要 | ✅ 直感的 |
| 要素数 | > 10 で有利 | < 10 では差なし |
| 個別マテリアル | ❌ 不可 | ✅ 可能 |
| 個別ライティング | ❌ 共有 | ✅ 個別 |

### InstancedBufferAttribute（per-instance color/size）

```typescript
function ColoredInstances({ count = 100 }: { count: number }) {
  const meshRef = useRef<THREE.InstancedMesh>(null)

  useEffect(() => {
    if (!meshRef.current) return
    const mesh = meshRef.current

    const colors = new Float32Array(count * 3)
    const scales = new Float32Array(count)
    const dummy = new THREE.Object3D()

    for (let i = 0; i < count; i++) {
      // 位置
      const hash = Math.sin(i * 12.9898 + 78.233) * 43758.5453
      dummy.position.set(
        (fract(hash) - 0.5) * 20,
        (fract(hash * 1.1) - 0.5) * 20,
        (fract(hash * 1.2) - 0.5) * 20,
      )
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)

      // per-instance カラー
      colors[i * 3] = fract(hash * 2.1)
      colors[i * 3 + 1] = fract(hash * 3.2)
      colors[i * 3 + 2] = fract(hash * 4.3)

      scales[i] = 0.5 + fract(hash * 5.4) * 1.5
    }

    mesh.instanceMatrix.needsUpdate = true
    mesh.geometry.setAttribute('instanceColor', new THREE.InstancedBufferAttribute(colors, 3))
  }, [count])

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      <sphereGeometry args={[0.1, 8, 8]} />
      <meshBasicMaterial vertexColors transparent opacity={0.6} />
    </instancedMesh>
  )
}
```

### Drei Instances コンポーネント

```typescript
import { Instances, Instance } from '@react-three/drei'

function InstancedTrees() {
  return (
    <Instances limit={200}>
      <boxGeometry />
      <meshStandardMaterial color="green" />
      {positions.map((pos, i) => (
        <Instance
          key={i}
          position={pos}
          scale={0.5 + Math.sin(i) * 0.3}
          color={`hsl(${120 + i * 5}, 60%, 40%)`}
        />
      ))}
    </Instances>
  )
}
```

### ジオメトリマージ（BufferGeometryUtils）

```typescript
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js'

const mergedGeometry = useMemo(() => {
  const geometries: THREE.BufferGeometry[] = []
  for (let i = 0; i < 50; i++) {
    const geo = new THREE.BoxGeometry(1, 1, 1)
    geo.translate(i * 2, 0, 0)
    geometries.push(geo)
  }
  return BufferGeometryUtils.mergeGeometries(geometries)
}, [])
```

## Drei ユーティリティ拡張

### ローディング系

| コンポーネント | 用途 | 使用例 |
|-------------|------|--------|
| `useGLTF` | GLTFモデルロード | `const { scene } = useGLTF(url)` |
| `useTexture` | テクスチャロード | `const tex = useTexture('/textures/wood.jpg')` |
| `useKTX2` | KTX2圧縮テクスチャ | GPU圧縮テクスチャ対応 |
| `Preload` | アセットプリロード | `<Preload all />` |

### インスタンシング系

| コンポーネント | 用途 | vs InstancedMesh |
|-------------|------|-----------------|
| `Instances` + `Instance` | 宣言的インスタンシング | R3F フレンドリーなAPI |
| `Merged` | ジオメトリマージ | 異なるジオメトリを1ドローコール化 |

### プロジェクション系

| コンポーネント | 用途 |
|-------------|------|
| `Decal` | メッシュ表面にテクスチャ投影 |
| `MeshReflectorMaterial` | 床面リアルタイム反射 |
| `MeshPortalMaterial` | ポータルエフェクト（別シーン覗き込み） |

### 可視性系

| フック | 用途 | 使用場面 |
|--------|------|---------|
| `useIntersect` | ビューポート可視性検出 | 画面外のメッシュ非表示化 |
| `Bvh` | BVH高速レイキャスト | 大量メッシュのクリック検出 |

### プロジェクト useScrollRef との使い分け

| ユーティリティ | 用途 | useScrollRef との関係 |
|-------------|------|---------------------|
| drei `useScroll` | R3F純正スクロール管理 | **使用しない** -- Lenis + ScrollTrigger と競合 |
| `useScrollRef` (プロジェクト) | Lenis → R3F ref | ✅ 使用（Lenis連携） |
| drei `ScrollControls` | R3F内スクロール | **使用しない** -- Lenis と競合 |

---
paths:
  - src/app/(public*)/**
---

# Three.js パターンルール

> Three.js 0.182.0 / @react-three/fiber 9.5 / @react-three/drei 10.7

## 概要

Three.js による3Dエフェクト。エフェクトレベル L3 以上で有効。
R3F（React Three Fiber）を使用し、React コンポーネントとして3Dシーンを構成。
→ `.claude/rules/visual-effects-patterns.md`

> **詳細リファレンス**: `docs/reference/claude-rules/threejs-reference.md`

## SSRゲートパターン（3段階）

```typescript
// 1. next/dynamic でSSR除外
const ThreeCanvasInner = dynamic(
  () => import('./ThreeCanvasInner').then((mod) => mod.ThreeCanvasInner),
  { ssr: false },
)

// 2. effectLevel + budget チェック
const shouldRenderThree = effectLevel >= 3 && budget.allowThreeJs

// 3. IntersectionObserver（rootMargin: 100px）
{shouldRenderThree && isInView ? <ThreeCanvasInner>...</ThreeCanvasInner> : fallback}
```

## Canvas 設定

```typescript
<Canvas
  frameloop="always"
  dpr={dpr}                    // PerformanceMonitor で 1-2 適応
  camera={{ fov: 50, position: [0, 0, 5], near: 0.1, far: 100 }}
  gl={{ alpha: true, antialias: false, powerPreference: 'high-performance' }}
  style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
/>
```

## PerformanceMonitor

```typescript
import type { PerformanceMonitorApi } from '@react-three/drei'

// useCallback で参照安定化（R3F API要件）
const handlePerformanceChange = useCallback((api: PerformanceMonitorApi) => {
  const newDpr = Math.round(0.5 + 1.5 * api.factor) // 1 or 2
  setDpr([newDpr, newDpr])
}, [])

const handleFallback = useCallback((_api: PerformanceMonitorApi) => {
  degradeTo(2)
}, [degradeTo])

<PerformanceMonitor
  flipflops={3}
  onChange={handlePerformanceChange}
  onFallback={handleFallback}
>
  {children}
</PerformanceMonitor>
```

## 基本マテリアル

```typescript
<meshBasicMaterial color={color} wireframe transparent opacity={0.3} />
```

| マテリアル | 特徴 | パフォーマンス |
|-----------|------|-------------|
| `meshBasicMaterial` | ライティング不要 | Excellent |
| `meshStandardMaterial` | PBR | Moderate |
| `meshPhysicalMaterial` | 透過/クリアコート | Poor |
| `MeshTransmissionMaterial` (drei) | ガラス/屈折 | Poor |

## パーティクル生成（決定的ハッシュ）

```typescript
function generateParticles(count: number, spread: number) {
  const positions = []
  for (let i = 0; i < count; i++) {
    const hash1 = Math.sin(i * 12.9898 + 78.233) * 43758.5453
    const hash2 = Math.sin(i * 45.164 + 93.233) * 43758.5453
    positions.push({ x: (fract(hash1) - 0.5) * spread, y: (fract(hash2) - 0.5) * spread })
  }
  return positions
}

function fract(x: number): number {
  return x - Math.floor(x)
}
```

InstancedMesh で描画（単一ドローコール）:

```typescript
<instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
  <sphereGeometry args={[size, 6, 6]} />
  <meshBasicMaterial color={color} transparent opacity={0.6} />
</instancedMesh>
```

## useFrame 基本 + ベストプラクティス

```typescript
// モジュールスコープで定義（useFrame 内で new しない）
const DUMMY_OBJECT = new THREE.Object3D()
const TEMP_VEC = new THREE.Vector3()

useFrame((_state, delta) => {
  const mesh = meshRef.current
  if (!mesh) return
  // delta 基準でフレームレート非依存
  DUMMY_OBJECT.position.set(x, y, z)
  DUMMY_OBJECT.updateMatrix()
  mesh.setMatrixAt(i, DUMMY_OBJECT.matrix)
  mesh.instanceMatrix.needsUpdate = true
})
```

## hooks 要約

| フック | 定義場所 | 用途 |
|--------|---------|------|
| `useScrollRef()` | `ThreeCanvas.tsx`（export） | R3F ツリー内で ScrollState ref にアクセス |
| `useThemeColors()` | `hooks/use-theme-colors.ts` | CSSカスタムプロパティ → THREE.Color 用文字列取得 |
| `useScrollUniforms()` | `hooks/use-scroll-uniforms.ts` | Lenis → mutable ref 同期（再レンダリングゼロ） |

### useScrollRef パターン

```typescript
// ThreeCanvas.tsx が ScrollRefContext.Provider を提供
// R3F ツリー内のコンポーネントで使用
import { useScrollRef } from './ThreeCanvas'

function ParticleField() {
  const scrollRef = useScrollRef()  // RefObject<ScrollState>

  useFrame(() => {
    const velocity = Math.abs(scrollRef.current.velocity)
    const progress = scrollRef.current.progress
    // ... React state を使わない（再レンダリングゼロ）
  })
}
```

## WebGL管理

ThreeCanvasInner の `onCreated` コールバックで登録、unmount の cleanup で解除。
`webGLContextManager.register/unregister` 必須（コンテキスト数管理）。

```typescript
const handleCreated = useCallback(
  (state: { gl: { domElement: HTMLCanvasElement } }) => {
    webGLContextManager.register({
      id,
      canvas: state.gl.domElement,
      type: 'three',
      createdAt: Date.now(),
    })
  },
  [id],
)

useEffect(() => {
  return () => {
    webGLContextManager.unregister(id)
  }
}, [id])
```

## リソース破棄

R3F はアンマウント時に `.dispose()` 自動呼出。グローバル共有リソースは `<group dispose={null}>` で保護。

## モバイル調整ルール

| 項目 | デスクトップ | モバイル |
|------|------------|--------|
| DPR | `[1, 2]` | `[1, 1.5]` |
| パーティクル数 | `count` | `count * 0.4` |
| ジオメトリセグメント | 6 | 4 |
| FOV | 50 | 60 |
| ポインターイベント | 有効可 | 常に `'none'` |

## CLS対策

```typescript
<div className="relative min-h-svh w-full">
  {/* z-[2]: visual-effects-patterns.md §Z-index ベースライン準拠 */}
  <ThreeCanvas id="hero-three" className="absolute inset-0 z-[2]">{/* ... */}</ThreeCanvas>
</div>
```

## GSAP ↔ Three.js 統合要約

ScrollTrigger → Three.js 連携はスクロールref経由が推奨。`gsap.to(mesh.position)` の直接制御は非推奨（R3Fの更新サイクルと競合）。

```typescript
// 推奨: ScrollTrigger onUpdate → ref → useFrame で参照
const scrollRef = useScrollRef()

ScrollTrigger.create({
  trigger: '.section',
  scrub: true,
  onUpdate: (self) => { scrollRef.current.progress = self.progress },
})

// useFrame 内で ref を参照
useFrame(() => {
  camera.position.z = 5 - scrollRef.current.progress * 3
})
```

| 方式 | 推奨度 | 理由 |
|------|--------|------|
| ScrollTrigger → ref → useFrame | ✅ 推奨 | R3F更新サイクルと同期 |
| gsap.to(mesh.position, {...}) | ⚠️ 非推奨 | R3Fのフレームループと競合する可能性 |
| gsap.to(uniforms, {...}) | ✅ OK | uniform値の更新は安全 |

> **詳細（カメラパス、shader uniform制御、セクション別シーン切替）**: → `docs/reference/claude-rules/threejs-reference.md` §GSAP ↔ Three.js 統合パターン

## モデルローディング要約

```typescript
import { useGLTF, Preload } from '@react-three/drei'
import { Suspense } from 'react'

function Model({ url }: { url: string }) {
  const { scene } = useGLTF(url)
  return <primitive object={scene.clone()} />
}

// Draco圧縮サポート
useGLTF.preload('/models/space.glb')

// 使用
<Suspense fallback={<LoadingPlaceholder />}>
  <Model url="/models/space.glb" />
</Suspense>
```

**モデル最適化チェックリスト**: ポリゴン < 50K、テクスチャ < 2048px、Draco圧縮有効、glb形式推奨。

> **詳細（Clone、アニメーションMixer、スクロール制御、最適化）**: → `docs/reference/claude-rules/threejs-reference.md` §モデルローディングパターン

## 禁止事項

1. **Server Component での Three.js import 禁止** — `'use client'` + `next/dynamic({ ssr: false })` 経由
2. **useMemo 内での Math.random() 禁止** — 決定的ハッシュ使用
3. **useFrame 内での React state 更新禁止** — ref 使用
4. **antialias: true の使用禁止**（デフォルト設定時）
5. **VisualEffectsProvider なしでの描画禁止** — `effectLevel >= 3 && budget.allowThreeJs` チェック
6. **WebGLコンテキスト登録漏れ禁止**
7. **pointerEvents 有効化禁止**（オーバーレイCanvas）
8. **useFrame 内での new オブジェクト生成禁止** — モジュールスコープ定数再利用（`DUMMY_OBJECT` 等）
9. **グローバルリソースの自動破棄禁止** — `<group dispose={null}>`

```typescript
// NG: Server Component で直接 import（SSR 時クラッシュ）
import { Canvas } from '@react-three/fiber'
export default function Page() { return <Canvas /> }

// OK: Client Component + dynamic import（ssr: false）
const ThreeCanvas = dynamic(() => import('./ThreeCanvas').then(m => m.ThreeCanvas), { ssr: false })
```

```typescript
// NG: useFrame 内で new THREE.Object3D()（フレームごとに GC プレッシャー）
useFrame(() => {
  const dummy = new THREE.Object3D()
  dummy.position.set(x, y, z)
})

// OK: モジュールスコープで1回だけ生成
const DUMMY_OBJECT = new THREE.Object3D()
useFrame(() => {
  DUMMY_OBJECT.position.set(x, y, z)
})
```

```typescript
// NG: useFrame 内で React state 更新（毎フレーム再レンダリング）
useFrame(() => {
  setPosition(mesh.current.position.x)
})

// OK: ref.current を直接操作
useFrame(() => {
  mesh.current.position.x += 0.01
})
```

## ファイル配置

パスは `src/app/(public)/_shared/components/` を起点とした相対パス。

| パス | 内容 |
|------|------|
| `effects/three/ThreeCanvas.tsx` | SSRゲート + effectLevel チェック + `useScrollRef()` export |
| `effects/three/ThreeCanvasInner.tsx` | R3F Canvas + PerformanceMonitor + WebGL登録 |
| `effects/three/ParticleField.tsx` | InstancedMesh パーティクル |
| `effects/three/FloatingGeometry.tsx` | Drei Float ワイヤフレーム（octahedron / icosahedron / tetrahedron / torus） |
| `effects/three/ImageDistortion.tsx` | 画像シェーダー歪みエフェクト |
| `effects/three/ScrollScene.tsx` | スクロール連動シーン切替 |
| `effects/three/hooks/use-scroll-uniforms.ts` | Lenis → mutable ref 同期（`useScrollUniforms()`） |
| `effects/three/hooks/use-theme-colors.ts` | CSS変数 → THREE.Color 用文字列変換（`useThemeColors()`） |

> **詳細パターン（マテリアルカタログ8種、ジオメトリカタログ7種+波面例、Dreiカタログ15種、ライティングレシピ4種、Float詳細、オンデマンドレンダリング、PostProcessing/EffectComposer、カスタムShaderMaterial 3パターン、ScrollScene、シェーダースニペット、ui-ux-pro-maxマッピング）**: → `docs/reference/claude-rules/threejs-reference.md`

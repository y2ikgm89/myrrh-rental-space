---
paths:
  - src/app/(public*)/**
---

# Three.js パターンルール

> Three.js / @react-three/fiber (R3F) / @react-three/drei

## 概要

Three.js による3Dエフェクト。エフェクトレベル L3 以上で有効。
R3F（React Three Fiber）を使用し、React コンポーネントとして3Dシーンを構成。
→ `.claude/rules/visual-effects-patterns.md`

> **詳細リファレンス**: `docs/reference/claude-rules/threejs-reference.md`

## SSRゲートパターン（3段階）

```typescript
// 1. next/dynamic でSSR除外
const ThreeCanvasInner = dynamic(() => import('./ThreeCanvasInner'), { ssr: false })

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
<PerformanceMonitor
  flipflops={3}
  onChange={({ factor }) => setDpr([Math.round(0.5 + 1.5 * factor), Math.round(0.5 + 1.5 * factor)])}
  onFallback={() => degradeTo(2)}
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
const DUMMY = new THREE.Object3D()   // モジュールスコープ（useFrame内でnewしない）
const TEMP_VEC = new THREE.Vector3()

useFrame((_state, delta) => {
  const mesh = meshRef.current
  if (!mesh) return
  // delta基準でフレームレート非依存
  DUMMY.position.set(x, y, z)
  DUMMY.updateMatrix()
  mesh.setMatrixAt(i, DUMMY.matrix)
  mesh.instanceMatrix.needsUpdate = true
})
```

## hooks 要約

| フック | 用途 |
|--------|------|
| `useThemeColors()` | CSSカスタムプロパティ → hex変換 |
| `useScrollRef()` | R3Fツリー内でScrollState ref アクセス |

## WebGL管理

ThreeCanvasInner の `onCreated` で登録、unmount で解除。`webGLContextManager.register/unregister` 必須。

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
8. **useFrame 内での new オブジェクト生成禁止** — モジュールスコープ定数再利用
9. **グローバルリソースの自動破棄禁止** — `<group dispose={null}>`

## ファイル配置

| パス | 内容 |
|------|------|
| `effects/three/ThreeCanvas.tsx` | SSRゲート + effectLevel チェック |
| `effects/three/ThreeCanvasInner.tsx` | R3F Canvas + PerformanceMonitor |
| `effects/three/ParticleField.tsx` | InstancedMesh パーティクル |
| `effects/three/FloatingGeometry.tsx` | Drei Float ワイヤフレーム |
| `effects/three/hooks/use-scroll-uniforms.ts` | Lenis → ref 同期 |
| `effects/three/hooks/use-theme-colors.ts` | CSS変数 → hex 色変換 |

> **詳細パターン（マテリアルカタログ8種、ジオメトリカタログ7種+波面例、Dreiカタログ15種、ライティングレシピ4種、Float詳細、オンデマンドレンダリング、PostProcessing/EffectComposer、カスタムShaderMaterial 3パターン、ScrollScene、シェーダースニペット、ui-ux-pro-maxマッピング）**: → `docs/reference/claude-rules/threejs-reference.md`

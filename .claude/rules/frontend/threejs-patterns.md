---
paths:
  - src/app/(public*)/**/*three*
  - src/app/(public*)/**/*Three*
  - src/app/(public*)/**/*Canvas*
---

# Three.js パターンルール

> Three.js / @react-three/fiber 9.5 / @react-three/drei 10.7

## 概要

旧 `effects/three/` インフラ（ThreeCanvas, ThreeCanvasInner 等 8ファイル）は削除済み。
パッケージ（`three`, `@react-three/fiber`, `@react-three/drei`）は利用可能。
使用時はページコンポーネントから直接 `import { Canvas } from "@react-three/fiber"` で import する。

> **詳細リファレンス**: `docs/reference/claude-rules/threejs-reference.md`

## 直接 import パターン（現行）

```typescript
"use client";
import dynamic from "next/dynamic";

// SSR 除外必須（WebGL は Node.js で動作しない）
const Scene = dynamic(() => import("./Scene"), { ssr: false });

export function ThreeSection() {
  return (
    <div className="relative h-svh">
      <Scene />
    </div>
  );
}
```

```typescript
// Scene.tsx（Client Component、dynamic import される側）
import { Canvas } from "@react-three/fiber";

export default function Scene() {
  return (
    <Canvas
      camera={{ fov: 50, position: [0, 0, 5] }}
      gl={{ alpha: true, antialias: false, powerPreference: "high-performance" }}
    >
      {/* R3F コンポーネント */}
    </Canvas>
  );
}
```

## useFrame ベストプラクティス

```typescript
// モジュールスコープで定義（useFrame 内で new しない）
const DUMMY_OBJECT = new THREE.Object3D();

useFrame((_state, delta) => {
  const mesh = meshRef.current;
  if (!mesh) return;
  // delta 基準でフレームレート非依存
  mesh.rotation.y += delta * 0.5;
});
```

## 禁止事項

1. **Server Component での Three.js import 禁止** — `'use client'` + `next/dynamic({ ssr: false })` 経由
2. **useFrame 内での React state 更新禁止** — ref 使用
3. **useFrame 内での new オブジェクト生成禁止** — モジュールスコープ定数再利用
4. **antialias: true 禁止**（パフォーマンス）
5. **Math.random() 禁止** — 決定的ハッシュ使用
6. **旧 ExperienceShell / VisualEffectsProvider パターン禁止** — 直接 import のみ

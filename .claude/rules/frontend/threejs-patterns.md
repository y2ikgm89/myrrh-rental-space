---
paths:
  - src/app/(public*)/**/*three*
  - src/app/(public*)/**/*Three*
  - src/app/(public*)/**/*Canvas*
---

# Three.js パターンルール

> [React Three Fiber](https://r3f.docs.pmnd.rs/getting-started/installation) + [three.js](https://threejs.org/docs/) + [@react-three/drei](https://github.com/pmndrs/drei)

## 依存関係

**現状のリポジトリ既定では `three` / `@react-three/fiber` / `@react-three/drei` は `package.json` に含めない。**
L3 を使うページを追加する際のみ、公式の推奨バージョン範囲で `bun add three @react-three/fiber @react-three/drei` し、ロックファイルを更新する。
旧 `effects/three/` インフラは削除済み — 復活させない。

## Next.js + R3F（公式に沿ったゲート）

WebGL はサーバーで実行できないため、**Client Component** と **`next/dynamic` の `ssr: false`** を組み合わせる（[Dynamic Import](https://nextjs.org/docs/app/guides/lazy-loading)）。

```typescript
"use client";
import dynamic from "next/dynamic";

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
// Scene.tsx — dynamic の子。top-level で Canvas をサーバーに載せない
"use client";
import { Canvas } from "@react-three/fiber";

export default function Scene() {
  return (
    <Canvas
      camera={{ fov: 50, position: [0, 0, 5] }}
      gl={{ alpha: true, antialias: false, powerPreference: "high-performance" }}
    >
      {/* R3F シーン */}
    </Canvas>
  );
}
```

## useFrame

`useFrame` 内では React state を更新しない。`delta` でフレームレート非依存にし、`new` をループ内で呼ばない。

```typescript
import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import type { Mesh } from "three";

export function SpinningMesh() {
  const meshRef = useRef<Mesh>(null);
  useFrame((_state, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    mesh.rotation.y += delta * 0.5;
  });
  return <mesh ref={meshRef}>{/* geometry / material */}</mesh>;
}
```

## 禁止事項

1. **Server Component での `three` / `@react-three/fiber` の同期 import**
2. **`useFrame` 内での `setState`**
3. **`useFrame` 毎フレームの `new`（ジオメトリ・`Vector3` 等）**
4. **不必要な `antialias: true`**（モバイル・低スペックでコスト増）
5. **非決定的シード（例: `Math.random()` そのまま）** — 再現性のあるパラメータに
6. **撤去済みの ExperienceShell / VisualEffectsProvider 経由の間接ロード**

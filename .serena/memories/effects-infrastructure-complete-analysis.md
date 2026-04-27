# Effects Infrastructure - Complete Analysis

> **Snapshot: 2026-03** — Three.js / R3F / PixiJS を使用していた頃の分析。2026-03-18 の Public Pages Redesign で 29 ファイル (~2,158 行) が削除済み。現状とは乖離あり。

## Overview

The effects infrastructure is a tiered visual enhancement system for the public pages with:
1. **L1**: CSS-only (no animations, prefers-reduced-motion)
2. **L2**: GSAP + Lenis smooth scroll (always safe)
3. **L3+**: Three.js with R3F (WebGL canvas-based 3D)
4. **L4**: PixiJS (Phase 3, not yet implemented)

GPU detection + performance monitoring dynamically selects the level.

---

## Directory Structure

```
src/app/(public)/_shared/components/effects/
├── core/
│   ├── types.ts                      # Type definitions, PERFORMANCE_BUDGETS
│   ├── device-capabilities.ts        # GPU detection (detect-gpu)
│   ├── webgl-context-manager.ts      # LRU WebGL context manager
│   ├── VisualEffectsProvider.tsx     # Context + GPU detection hook
│   ├── ScrollOrchestrator.tsx        # Scroll state management
│   ├── PerformanceMonitor.tsx        # Performance tracking
│   └── index.ts                      # Re-exports
├── three/
│   ├── types.ts                      # ThreeCanvas/ThreeCanvasInner props
│   ├── ThreeCanvas.tsx               # SSR gate + effectLevel check
│   ├── ThreeCanvasInner.tsx          # R3F Canvas + PerformanceMonitor
│   ├── ParticleField.tsx             # InstancedMesh particle system
│   ├── FloatingGeometry.tsx          # Drei Float 3D geometry
│   ├── ScrollScene.tsx               # Scroll-driven 3D scene
│   ├── ImageDistortion.tsx           # Distortion shader effect
│   ├── hooks/
│   │   ├── use-scroll-uniforms.ts    # Lenis → mutable ref (zero-copy)
│   │   └── use-theme-colors.ts       # CSS color extraction
│   └── index.ts                      # Re-exports
├── integration/
│   ├── EnhancedHero.tsx              # ParallaxHero + Three.js overlay
│   ├── EnhancedCTA.tsx               # CTA section + Three.js overlay
│   ├── EnhancedSpaceList.tsx         # Space list + Three.js overlay
│   ├── EnhancedFloatingAccents.tsx   # FloatingAccents → 3D geometry
│   └── index.ts                      # Re-exports
└── animations/
    └── FloatingAccents.tsx           # L2 fallback: GSAP SVG parallax
```

---

## Core Types & Constants

### Effect Levels (types.ts)

```typescript
type EffectLevel = 1 | 2 | 3 | 4
// L1 = CSS only
// L2 = GSAP + Lenis
// L3 = Three.js
// L4 = PixiJS (planned)

interface DeviceCapabilities {
  gpuTier: 0 | 1 | 2 | 3
  isMobile: boolean
  prefersReducedMotion: boolean
  effectLevel: EffectLevel
  gpuModel: string | null
  estimatedFps: number | null
}

const PERFORMANCE_BUDGETS: Record<EffectLevel, PerformanceBudget> = {
  1: { targetFps: 30, maxWebGLContexts: 0, allowThreeJs: false, allowPixiJs: false },
  2: { targetFps: 45, maxWebGLContexts: 0, allowThreeJs: false, allowPixiJs: false },
  3: { targetFps: 60, maxWebGLContexts: 4, allowThreeJs: true, allowPixiJs: false },
  4: { targetFps: 60, maxWebGLContexts: 8, allowThreeJs: true, allowPixiJs: true },
}
```

### Conversion Function

```typescript
function toEffectLevel(n: number): EffectLevel {
  if (n <= 1) return 1
  if (n === 2) return 2
  if (n === 3) return 3
  return 4
}
```

---

## WebGL Context Manager

**File**: `webgl-context-manager.ts`

LRU (Least Recently Used) singleton managing WebGL contexts:

```typescript
class WebGLContextManagerImpl {
  private entries = new Map<string, WebGLContextEntry>()
  private accessOrder: string[] = []
  private maxContexts = 8

  register(entry: WebGLContextEntry): boolean     // Returns false if no capacity
  unregister(id: string): void
  touch(id: string): void                         // Update LRU order
  get(id: string): WebGLContextEntry | undefined
  hasCapacity: boolean
  count: number
}

export const webGLContextManager = new WebGLContextManagerImpl()
```

**Why class-based singleton**: React context is not appropriate for browser resource limits.

---

## GPU Detection Flow

**File**: `device-capabilities.ts`

```typescript
async function detectDeviceCapabilities(): Promise<DeviceCapabilities>
  1. Check prefersReducedMotion → L1
  2. Dynamic import detect-gpu
  3. getGPUTier() → gpuTier (0-3)
  4. Mobile penalty: downgrade 1 level if isMobile
  5. Fallback to L2 if detection fails
```

Runs once in `VisualEffectsProvider` useEffect.

---

## VisualEffectsProvider

**File**: `VisualEffectsProvider.tsx`

Context providing:
- `capabilities`: detected GPU info
- `effectLevel`: current L1-4 level
- `budget`: PERFORMANCE_BUDGETS[effectLevel]
- `isReady`: GPU detection complete
- `degradeTo(level)`: downgrade-only level change

```typescript
const [effectLevel, setEffectLevel] = useState<EffectLevel>(2)  // Default L2
useEffect(() => {
  detectDeviceCapabilities().then(caps => {
    setCapabilities(caps)
    setEffectLevel(caps.effectLevel)
    setIsReady(true)
  })
}, [])

// prefers-reduced-motion watcher
useEffect(() => {
  const mql = window.matchMedia('(prefers-reduced-motion: reduce)')
  mql.addEventListener('change', (e) => {
    if (e.matches) setEffectLevel(1)
  })
}, [])

// Downgrade-only (Math.min)
const degradeTo = useCallback((level: EffectLevel) => {
  setEffectLevel(current => toEffectLevel(Math.min(current, level)))
}, [])
```

---

## ThreeCanvas Component Pattern

**File**: `ThreeCanvas.tsx`

SSR-safe gate + effectLevel gatekeeper:

```typescript
const ThreeCanvasInner = dynamic(
  () => import('./ThreeCanvasInner'),
  { ssr: false }  // No Three.js import until client
)

function ThreeCanvas({
  children,
  fallback,
  id,
  className,
  frameloop = 'always',
  fov,
  cameraPosition
}) {
  const { effectLevel, budget, degradeTo } = useVisualEffects()
  const scrollRef = useScrollUniforms()  // Lenis subscription
  const [isInView, setIsInView] = useState(false)

  const shouldRenderThree = effectLevel >= 3 && budget.allowThreeJs

  // IntersectionObserver: viewport detection (preload with 100px margin)
  useEffect(() => {
    if (!shouldRenderThree) return
    const observer = new IntersectionObserver(
      ([entry]) => setIsInView(entry.isIntersecting),
      { rootMargin: '100px' }
    )
    observer.observe(containerRef.current)
    return () => observer.disconnect()
  }, [shouldRenderThree])

  return (
    <div ref={containerRef} id={id} className={className}>
      {shouldRenderThree && isInView ? (
        <ScrollRefContext.Provider value={scrollRef}>
          <ThreeCanvasInner {...props} scrollRef={scrollRef} degradeTo={degradeTo} />
        </ScrollRefContext.Provider>
      ) : (
        fallback ?? null
      )}
    </div>
  )
}

// Context hook for useFrame access within R3F tree
function useScrollRef(): RefObject<ScrollState> {
  const ref = useContext(ScrollRefContext)
  if (!ref) throw new Error('useScrollRef must be used within ThreeCanvas')
  return ref
}
```

**Key Design**:
- SSR gate prevents Three.js import on server
- Conditional rendering: L3+ && isInView && allowThreeJs
- ScrollRefContext provides Lenis data inside R3F tree

---

## ThreeCanvasInner Component

**File**: `ThreeCanvasInner.tsx`

R3F Canvas with Drei PerformanceMonitor:

```typescript
function ThreeCanvasInner({
  children,
  id,
  frameloop = 'always',
  fov = 50,
  cameraPosition = [0, 0, 5],
  degradeTo
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [dpr, setDpr] = useState<[number, number]>([1, 2])

  // WebGL context registration
  const handleCreated = useCallback((state: { gl: { domElement } }) => {
    webGLContextManager.register({
      id,
      canvas: state.gl.domElement,
      type: 'three',
      createdAt: Date.now()
    })
  }, [id])

  // DPR adaptive response
  const handlePerformanceChange = useCallback((api: PerformanceMonitorApi) => {
    const newDpr = Math.round(0.5 + 1.5 * api.factor)  // 1 or 2
    setDpr([newDpr, newDpr])
  }, [])

  // Fallback: flipflops >= 3 → degrade to L2
  const handleFallback = useCallback(() => {
    degradeTo(2)
  }, [degradeTo])

  // Cleanup
  useEffect(() => {
    return () => webGLContextManager.unregister(id)
  }, [id])

  return (
    <Canvas
      frameloop={frameloop}
      dpr={dpr}
      camera={{ fov, position: cameraPosition, near: 0.1, far: 100 }}
      gl={{ alpha: true, antialias: false, powerPreference: 'high-performance' }}
      onCreated={handleCreated}
    >
      <PerformanceMonitor
        flipflops={3}
        onChange={handlePerformanceChange}
        onFallback={handleFallback}
      >
        {children}
      </PerformanceMonitor>
    </Canvas>
  )
}
```

**Performance Features**:
- DPR 1-2 adaptive based on load
- Flipflop detection (3 flips → degrade)
- WebGL context registration
- Canvas cleanup

---

## Scroll Uniforms Hook

**File**: `use-scroll-uniforms.ts`

Zero-copy Lenis subscription into mutable ref:

```typescript
import { useLenis } from 'lenis/react'

function useScrollUniforms(): RefObject<ScrollState> {
  const ref = useRef<ScrollState>(INITIAL_SCROLL_STATE)

  useLenis((lenis) => {
    ref.current = {
      scroll: lenis.scroll,
      limit: lenis.limit,
      velocity: lenis.velocity,
      progress: lenis.progress,
      direction: lenis.direction === 1 ? 1 : lenis.direction === -1 ? -1 : 0,
      isScrolling: lenis.isScrolling === true
    }
  })

  return ref
}

// Usage in R3F:
function MyComponent() {
  const scrollRef = useScrollRef()
  useFrame(() => {
    const { scroll, velocity, progress } = scrollRef.current
    // Use scroll data for animation
  })
}
```

**Why mutable ref**: Avoids React state updates, preventing re-renders from 60fps scroll events.

---

## Theme Colors Hook

**File**: `use-theme-colors.ts`

Extracts CSS custom properties → THREE.Color:

```typescript
function useThemeColors(): ThemeColors {
  // Extract from CSS variables (set in admin.css / public.css)
  // Example: var(--color-primary) → #2563eb
  return {
    primary: extractCSSVar('--color-primary'),
    background: extractCSSVar('--color-background'),
    foreground: extractCSSVar('--color-foreground'),
    accent: extractCSSVar('--color-accent')
  }
}
```

---

## Three.js Effect Components

### ParticleField

**File**: `ParticleField.tsx`

InstancedMesh particle system (single draw call):

```typescript
function ParticleField({
  count = 150,
  spread = 12,
  size = 0.03
}) {
  const meshRef = useRef<THREE.InstancedMesh>()
  const scrollRef = useScrollRef()
  const colors = useThemeColors()

  // Deterministic particles (React Compiler compatible)
  const particles = useMemo(
    () => generateParticles(count, spread),
    [count, spread]
  )

  // Initial matrix setup
  useEffect(() => {
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i]
      DUMMY_OBJECT.position.set(p.x, p.y, p.z)
      DUMMY_OBJECT.updateMatrix()
      meshRef.current.setMatrixAt(i, DUMMY_OBJECT.matrix)
    }
    meshRef.current.instanceMatrix.needsUpdate = true
  }, [particles])

  // Animation loop
  useFrame((_state, delta) => {
    const velocity = Math.abs(scrollRef.current.velocity)
    const scrollY = scrollRef.current.scroll * 0.001

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i]
      // Float animation + scroll velocity boost
      DUMMY_OBJECT.position.set(
        p.x + Math.sin(scrollY + i * 0.1) * 0.3,
        p.y + Math.cos(scrollY * 0.7 + i * 0.15) * 0.2 + velocity * delta * p.speed * 0.5,
        p.z + Math.sin(scrollY * 0.5 + i * 0.2) * 0.1
      )
      DUMMY_OBJECT.rotation.y += (p.speed * delta * 0.3) * 0.5
      DUMMY_OBJECT.updateMatrix()
      meshRef.current.setMatrixAt(i, DUMMY_OBJECT.matrix)
    }
    meshRef.current.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      <sphereGeometry args={[size, 6, 6]} />
      <meshBasicMaterial color={color} transparent opacity={0.6} />
    </instancedMesh>
  )
}

// Particle generation (seeded pseudo-random, deterministic)
function generateParticles(count: number, spread: number): ParticleData[] {
  const positions = []
  for (let i = 0; i < count; i++) {
    const hash1 = Math.sin(i * 12.9898 + 78.233) * 43758.5453
    const hash2 = Math.sin(i * 45.164 + 93.233) * 43758.5453
    const hash3 = Math.sin(i * 67.345 + 12.456) * 43758.5453
    const hash4 = Math.sin(i * 23.678 + 56.789) * 43758.5453

    positions.push({
      x: (fract(hash1) - 0.5) * spread,
      y: (fract(hash2) - 0.5) * spread,
      z: (fract(hash3) - 0.5) * spread * 0.5,
      speed: 0.2 + fract(hash4) * 0.8
    })
  }
  return positions
}
```

### FloatingGeometry

**File**: `FloatingGeometry.tsx`

Drei Float wrapper for wireframe geometries:

```typescript
type GeometryType = 'octahedron' | 'icosahedron' | 'tetrahedron' | 'torus'

function FloatingGeometry({
  geometry = 'octahedron',
  position = [0, 0, 0],
  scale = 0.5,
  floatSpeed = 1.5,
  rotationIntensity = 1,
  opacity = 0.3
}) {
  const meshRef = useRef<THREE.Mesh>()
  const scrollRef = useScrollRef()
  const colors = useThemeColors()

  // Rotate based on scroll progress
  useFrame(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const progress = scrollRef.current.progress
    mesh.rotation.x = progress * Math.PI * 2 * 0.3
    mesh.rotation.z = progress * Math.PI * 2 * 0.2
  })

  return (
    <Float speed={floatSpeed} rotationIntensity={rotationIntensity} floatIntensity={1}>
      <mesh ref={meshRef} position={position} scale={scale}>
        {renderGeometry(geometry)}
        <meshBasicMaterial color={color} wireframe transparent opacity={opacity} />
      </mesh>
    </Float>
  )
}
```

---

## Integration Components

### EnhancedHero

**File**: `EnhancedHero.tsx`

Adds ThreeCanvas overlay to ParallaxHero:

```typescript
function EnhancedHero({ config }: { config: ParallaxHeroConfig }) {
  return (
    <div className="relative">
      <ParallexHero config={config} />
      <ThreeCanvas id="hero-three-overlay" className="pointer-events-none absolute inset-0 z-[2]">
        <ambientLight intensity={0.5} />
        <ParticleField count={80} spread={10} size={0.025} />
        <FloatingGeometry geometry="octahedron" position={[-4, 2, -2]} scale={0.5} opacity={0.15} />
        <FloatingGeometry geometry="icosahedron" position={[4, -1, -1.5]} scale={0.4} opacity={0.12} />
        <FloatingGeometry geometry="tetrahedron" position={[0, 3, -3]} scale={0.35} opacity={0.1} />
      </ThreeCanvas>
    </div>
  )
}
```

Z-index: 0 (bg) → 2 (Three.js) → 5 (accents) → 10 (text)

### EnhancedCTA

**File**: `EnhancedCTA.tsx`

Same pattern but accepts children (composition):

```typescript
function EnhancedCTA({ children }) {
  return (
    <div className="relative">
      {children}
      <ThreeCanvas id="cta-three-overlay" className="pointer-events-none absolute inset-0 z-[2]">
        <ambientLight intensity={0.5} />
        <ParticleField count={80} spread={15} size={0.02} />
        <FloatingGeometry geometry="octahedron" position={[-5, 0, -2]} scale={0.4} opacity={0.08} />
        <FloatingGeometry geometry="icosahedron" position={[5, -1, -1.5]} scale={0.35} opacity={0.08} />
      </ThreeCanvas>
    </div>
  )
}
```

### EnhancedSpaceList

**File**: `EnhancedSpaceList.tsx`

Single ThreeCanvas for entire section (WebGL context savings):

```typescript
function EnhancedSpaceList({ children }) {
  return (
    <div className="relative">
      {children}
      <ThreeCanvas id="space-list-three-overlay" className="pointer-events-none absolute inset-0 z-[2]">
        <ambientLight intensity={0.5} />
        <ParticleField count={60} spread={12} size={0.02} />
        <FloatingGeometry geometry="octahedron" position={[-6, 2, -2]} scale={0.3} opacity={0.06} />
        <FloatingGeometry geometry="tetrahedron" position={[6, -1, -1.5]} scale={0.25} opacity={0.07} />
        <FloatingGeometry geometry="torus" position={[0, 3, -3]} scale={0.2} opacity={0.06} />
      </ThreeCanvas>
    </div>
  )
}
```

### EnhancedFloatingAccents

**File**: `EnhancedFloatingAccents.tsx`

Replaces existing FloatingAccents SVG with 3D:

```typescript
function EnhancedFloatingAccents() {
  return (
    <ThreeCanvas
      id="floating-accents-3d"
      className="pointer-events-none fixed inset-0 z-0"
      fallback={<FloatingAccents />}  // L2 fallback
    >
      <ambientLight intensity={0.4} />
      <ParticleField count={120} spread={12} size={0.03} />
      {/* 7 floating geometries matching original SVG positions */}
      <FloatingGeometry geometry="octahedron" position={[-5, 3, -2]} scale={0.4} opacity={0.15} />
      <FloatingGeometry geometry="icosahedron" position={[5, 2, -1.5]} scale={0.35} opacity={0.12} />
      {/* ... more */}
    </ThreeCanvas>
  )
}
```

---

## SmoothScrollProvider

**File**: `SmoothScrollProvider.tsx`

Lenis を直接管理し、GSAP ticker と原子的に統合。`lenis/react` の `LenisContext` を提供:

```typescript
import Lenis from 'lenis'
import { LenisContext, type LenisContextValue } from 'lenis/react'

function SmoothScrollProvider({ children }) {
  // useSyncExternalStore で React Compiler 互換
  const storeRef = useRef<LenisStore>({ value: null, listeners: new Set() })
  const contextValue = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  useEffect(() => {
    if (prefersReducedMotion()) return

    const lenis = new Lenis({ duration: 1.2 })  // autoRaf: false（デフォルト）

    // Lenis 公式推奨 GSAP 統合パターン
    lenis.on('scroll', ScrollTrigger.update)
    lenis.on('scroll', () => { /* useLenis() callbacks dispatch */ })

    const tickerCb = (time) => lenis.raf(time * 1000)
    gsap.ticker.add(tickerCb)
    gsap.ticker.lagSmoothing(0)
    gsap.config({ autoSleep: 0 })  // ticker スリープ防止（必須）

    // 外部ストア更新 → useSyncExternalStore が再レンダリングをトリガー
    store.value = { lenis, addCallback, removeCallback }
    notifyListeners(store)
    ScrollTrigger.refresh()

    // 動的コンテンツ対応: ResizeObserver で body 高さ変化を検知し自動 refresh
    const ro = new ResizeObserver(() => {
      ScrollTrigger.refresh(true) // safe mode: スクロール完了後に実行
    })
    ro.observe(document.body)

    return () => {
      gsap.ticker.remove(tickerCb)
      lenis.destroy()
    }
  }, [])

  return (
    <LenisContext.Provider value={contextValue}>
      {children}
    </LenisContext.Provider>
  )
}

// 消費側: useLenis() from 'lenis/react'
import { useLenis } from 'lenis/react'
const lenis = useLenis()
useLenis((lenis) => { /* scroll callback */ })
```

**設計判断**: `ReactLenis` コンポーネントは不使用。二段階初期化（Lenis作成 → ticker接続）で
HMR時にスクロール不能になるギャップがあるため、直接管理で原子的に統合。

---

## Next.js Configuration

**File**: `next.config.ts`

Key optimizations for effects:

```typescript
experimental: {
  optimizePackageImports: [
    'three',
    '@react-three/fiber',
    '@react-three/drei',
    'detect-gpu',
    'gsap',
    'lenis',
  ]
}

transpilePackages: ['better-auth']

turbopack: {
  resolveAlias: {
    'next/headers': 'next/headers.js',
    'next/navigation': 'next/navigation.js'
  }
}
```

---

## Package Dependencies

Key versions:
- `three`: ^0.182.0
- `@react-three/fiber`: ^9.5.0
- `@react-three/drei`: ^10.7.7
- `detect-gpu`: ^5.0.70
- `gsap`: ^3.14.2
- `lenis`: ^1.3.17

---

## Z-Index Management Across Components

### Hero Section
- z-0: Background image/gradient (L2)
- z-[2]: ThreeCanvas overlay (L3+)
- z-[5]: Gold accents
- z-10: Text content

### CTA Section
- z-0: CSS gradient background
- z-[2]: ThreeCanvas overlay (L3+)
- z-10: CTA text/buttons

### Space List
- z-0: Dots pattern background
- z-[2]: ThreeCanvas overlay (L3+)
- z-10: Space cards/text

### Floating Accents (global)
- z-0: FloatingAccents or 3D geometry (fixed positioned)
- z-10: Page content above

---

## Performance Budget Summary

| Level | Target FPS | WebGL Contexts | Three.js | PixiJS | Use Case |
|-------|-----------|----------------|----------|--------|----------|
| 1 | 30 | 0 | ❌ | ❌ | prefers-reduced-motion, very low GPU |
| 2 | 45 | 0 | ❌ | ❌ | Mobile, low GPU tier (default) |
| 3 | 60 | 4 | ✅ | ❌ | Desktop low-mid GPU |
| 4 | 60 | 8 | ✅ | ✅ | High-end GPU |

---

## Integration Pattern

1. **Wrap existing component with Enhanced***: Additive overlay approach
2. **Check L3+ gating**: ThreeCanvas handles shouldRenderThree
3. **Viewport detection**: IntersectionObserver + 100px margin
4. **Fallback gracefully**: If L2, render CSS/GSAP version

Example:
```typescript
// Before
<HeroSection config={config} />

// After (L3+)
<EnhancedHero config={config} />
// → Still renders HeroSection (L2 works)
// → Adds ThreeCanvas overlay if L3+ && isInView
```

---

## Key Design Principles

1. **Tiered Degradation**: L1 → L2 → L3 → L4 (always have fallback)
2. **Zero-Copy Scroll**: Mutable ref avoids React state churn
3. **SSR Safe**: dynamic({ ssr: false }) gates all WebGL
4. **Context Sharing**: ScrollRefContext passes scroll data into R3F tree
5. **LRU WebGL Management**: Browser limits (~8-16 contexts) respected
6. **React Compiler Compatible**: Deterministic generation, useMemo for colors
7. **Single Canvas Per Section**: InstancedMesh + multiple geometries = low overhead
8. **Composition Over Replacement**: Enhanced* wraps existing, doesn't replace

---

## Known Limitations & Next Steps

1. **PixiJS not implemented** (Phase 3, L4 only)
2. **ScrollScene & ImageDistortion** not shown in current integration
3. **Node transforms pattern** available but not active in current effects
4. **WebGL context eviction** doesn't explicitly log evictions (silent)


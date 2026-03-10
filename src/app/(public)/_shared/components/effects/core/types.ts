/** GPU Tier に応じたエフェクトレベル */
export type EffectLevel = 1 | 2 | 3 | 4;
// L1 = CSS only, L2 = GSAP+Lenis, L3 = Three.js (Phase 2), L4 = PixiJS (Phase 3)

/** GPU Tier → EffectLevel 変換（型安全、as不使用） */
export function toEffectLevel(n: number): EffectLevel {
  if (n <= 1) return 1;
  if (n === 2) return 2;
  if (n === 3) return 3;
  return 4;
}

export interface DeviceCapabilities {
  readonly gpuTier: 0 | 1 | 2 | 3;
  readonly isMobile: boolean;
  readonly prefersReducedMotion: boolean;
  readonly effectLevel: EffectLevel;
  readonly gpuModel: string | null;
  readonly estimatedFps: number | null;
}

export interface ScrollState {
  readonly scroll: number;
  readonly limit: number;
  readonly velocity: number;
  readonly progress: number;
  readonly direction: -1 | 0 | 1;
  readonly isScrolling: boolean;
}

export interface PerformanceBudget {
  readonly targetFps: number;
  readonly maxWebGLContexts: number;
  readonly allowThreeJs: boolean;
  readonly allowPixiJs: boolean;
}

export const PERFORMANCE_BUDGETS: Record<EffectLevel, PerformanceBudget> = {
  1: {
    targetFps: 30,
    maxWebGLContexts: 0,
    allowThreeJs: false,
    allowPixiJs: false,
  },
  2: {
    targetFps: 45,
    maxWebGLContexts: 0,
    allowThreeJs: false,
    allowPixiJs: false,
  },
  3: {
    targetFps: 60,
    maxWebGLContexts: 4,
    allowThreeJs: true,
    allowPixiJs: false,
  },
  4: {
    targetFps: 60,
    maxWebGLContexts: 8,
    allowThreeJs: true,
    allowPixiJs: true,
  },
};

export interface WebGLContextEntry {
  readonly id: string;
  readonly canvas: HTMLCanvasElement;
  readonly type: "three" | "pixi" | "raw";
  readonly createdAt: number;
}

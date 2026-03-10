import type { DeviceCapabilities } from "./types";
import { toEffectLevel } from "./types";

function clampGpuTier(tier: number): 0 | 1 | 2 | 3 {
  if (tier <= 0) return 0;
  if (tier === 1) return 1;
  if (tier === 2) return 2;
  return 3;
}

/**
 * detect-gpu がベンチマーク取得失敗時の WebGL 直接検出フォールバック。
 * WebGL2 + 専用 GPU → tier 3、WebGL2 統合GPU → tier 2、WebGL1 → tier 1、なし → tier 0
 */
function detectGpuTierFromWebGL(): {
  tier: 0 | 1 | 2 | 3;
  isMobile: boolean;
  gpu: string | null;
} {
  if (typeof document === "undefined") {
    return { tier: 0, isMobile: false, gpu: null };
  }

  const canvas = document.createElement("canvas");
  const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
  if (!gl) {
    return { tier: 0, isMobile: false, gpu: null };
  }

  const debugInfo = gl.getExtension("WEBGL_debug_renderer_info");
  const renderer = debugInfo
    ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
    : null;
  const gpu = typeof renderer === "string" ? renderer : null;

  const isMobile = /Mobi|Android/i.test(navigator.userAgent);

  // 専用 GPU キーワード検出
  const isDedicatedGpu =
    gpu !== null && /NVIDIA|Radeon|GeForce|RTX|GTX|RX\s?\d/i.test(gpu);

  // WebGL2 + 専用 GPU → tier 3
  if (canvas.getContext("webgl2") && isDedicatedGpu) {
    return { tier: 3, isMobile, gpu };
  }
  // WebGL2 → tier 2
  if (canvas.getContext("webgl2")) {
    return { tier: 2, isMobile, gpu };
  }
  // WebGL1 のみ → tier 1
  return { tier: 1, isMobile, gpu };
}

/**
 * デバイスのGPU能力を検出し、DeviceCapabilities を返す。
 * - SSR安全: detect-gpu を dynamic import
 * - prefersReducedMotion → 常にL1
 * - detect-gpu ベンチマーク失敗時 → WebGL 直接検出フォールバック
 */
export async function detectDeviceCapabilities(): Promise<DeviceCapabilities> {
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (prefersReducedMotion) {
    return {
      gpuTier: 0,
      isMobile: false,
      prefersReducedMotion: true,
      effectLevel: 1,
      gpuModel: null,
      estimatedFps: null,
    };
  }

  // detect-gpu でベンチマーク取得を試行
  let gpuTier: 0 | 1 | 2 | 3;
  let isMobile: boolean;
  let gpuModel: string | null;
  let estimatedFps: number | null;

  try {
    const { getGPUTier } = await import("detect-gpu");
    const result = await getGPUTier();

    gpuTier = clampGpuTier(result.tier);
    isMobile = result.isMobile ?? false;
    gpuModel = result.gpu ?? null;
    estimatedFps = result.fps ?? null;

    // detect-gpu がベンチマーク取得失敗（type: "FALLBACK"）または tier 0 の場合、
    // WebGL 直接検出で実際の GPU 能力を推定する
    const isBenchmarkUnreliable = result.type === "FALLBACK" || gpuTier === 0;
    if (isBenchmarkUnreliable) {
      const fallback = detectGpuTierFromWebGL();
      if (fallback.tier > gpuTier) {
        gpuTier = fallback.tier;
        isMobile = fallback.isMobile;
        gpuModel = fallback.gpu ?? gpuModel;
      }
    }
  } catch {
    // detect-gpu import 自体が失敗 → WebGL 直接検出フォールバック
    const fallback = detectGpuTierFromWebGL();
    gpuTier = fallback.tier;
    isMobile = fallback.isMobile;
    gpuModel = fallback.gpu;
    estimatedFps = null;
  }

  // デスクトップ tier 3 → L4（PixiJS 2D エフェクト追加）
  // モバイルは1段階下げる（L3→L2など）
  const baseLevel = gpuTier === 3 && !isMobile ? 4 : gpuTier;
  const rawLevel = toEffectLevel(baseLevel);
  const effectLevel =
    isMobile && rawLevel > 1 ? toEffectLevel(baseLevel - 1) : rawLevel;

  return {
    gpuTier,
    isMobile,
    prefersReducedMotion: false,
    effectLevel,
    gpuModel,
    estimatedFps,
  };
}

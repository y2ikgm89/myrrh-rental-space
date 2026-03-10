"use client";

import { useEffect, useRef } from "react";
import { useVisualEffects } from "./VisualEffectsProvider";
import { toEffectLevel } from "./types";

const SAMPLE_SIZE = 60;
const DEFAULT_THRESHOLD_FPS = 30;
const CONSECUTIVE_FAILURES_TO_DEGRADE = 3;

/**
 * rAFベースのFPS監視コンポーネント。
 * FPSが閾値を連続で下回った場合、EffectLevel を1段階劣化させる。
 * L1（CSS only）では監視をスキップ。
 *
 * UIを描画しない副作用専用コンポーネント。
 */
export function PerformanceMonitor({
  thresholdFps = DEFAULT_THRESHOLD_FPS,
}: {
  thresholdFps?: number;
}) {
  const { effectLevel, degradeTo } = useVisualEffects();
  const samplesRef = useRef<number[]>([]);
  const lastTimeRef = useRef(0);
  const failCountRef = useRef(0);

  useEffect(() => {
    // L1では監視不要（CSS onlyにこれ以上劣化できない）
    if (effectLevel <= 1) return;

    let rafId = 0;

    const tick = (now: number) => {
      if (lastTimeRef.current > 0) {
        const delta = now - lastTimeRef.current;
        if (delta > 0) {
          const fps = 1000 / delta;
          const samples = samplesRef.current;
          samples.push(fps);

          if (samples.length > SAMPLE_SIZE) {
            samples.shift();
          }

          if (samples.length === SAMPLE_SIZE) {
            const avg = samples.reduce((sum, v) => sum + v, 0) / SAMPLE_SIZE;

            if (avg < thresholdFps) {
              failCountRef.current += 1;
              if (failCountRef.current >= CONSECUTIVE_FAILURES_TO_DEGRADE) {
                degradeTo(toEffectLevel(effectLevel - 1));
                failCountRef.current = 0;
                samplesRef.current = [];
              }
            } else {
              failCountRef.current = 0;
            }
          }
        }
      }

      lastTimeRef.current = now;
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(rafId);
      samplesRef.current = [];
      lastTimeRef.current = 0;
      failCountRef.current = 0;
    };
  }, [effectLevel, degradeTo, thresholdFps]);

  return null;
}

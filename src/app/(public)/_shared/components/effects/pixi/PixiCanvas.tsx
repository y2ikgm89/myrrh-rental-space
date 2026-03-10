"use client";

import { useRef, useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useVisualEffects } from "../core/VisualEffectsProvider";
import type { PixiCanvasProps } from "./types";

/**
 * SSR ゲート + effectLevel チェック。
 * PixiJS を直接 import しない（バンドルサイズ影響なし）。
 * effectLevel >= 4 && budget.allowPixiJs の場合のみ PixiCanvasInner をロード。
 *
 * ThreeCanvas.tsx と同一パターン:
 * - IntersectionObserver（rootMargin: 100px）で viewport culling
 * - next/dynamic({ ssr: false }) で遅延ロード
 */

const PixiCanvasInner = dynamic(
  () => import("./PixiCanvasInner").then((mod) => mod.PixiCanvasInner),
  { ssr: false },
);

export function PixiCanvas({
  children,
  fallback,
  id,
  className,
}: PixiCanvasProps) {
  const { effectLevel, budget, degradeTo } = useVisualEffects();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isInView, setIsInView] = useState(false);

  const shouldRenderPixi = effectLevel >= 4 && budget.allowPixiJs;

  // IntersectionObserver でビューポート外を検知
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !shouldRenderPixi) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry) {
          setIsInView(entry.isIntersecting);
        }
      },
      { rootMargin: "100px" },
    );
    observer.observe(el);

    return () => observer.disconnect();
  }, [shouldRenderPixi]);

  return (
    <div ref={containerRef} id={id} className={className}>
      {shouldRenderPixi && isInView ? (
        <PixiCanvasInner id={id} fallback={fallback} degradeTo={degradeTo}>
          {children}
        </PixiCanvasInner>
      ) : (
        (fallback ?? null)
      )}
    </div>
  );
}

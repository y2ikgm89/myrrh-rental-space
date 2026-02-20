"use client";

import { useRef, useEffect, useState, createContext, use } from "react";
import type { RefObject } from "react";
import dynamic from "next/dynamic";
import { useVisualEffects } from "../core/VisualEffectsProvider";
import { useScrollUniforms } from "./hooks/use-scroll-uniforms";
import type { ThreeCanvasProps } from "./types";
import type { ScrollState } from "../core/types";

/**
 * ScrollRef を R3F ツリー内に提供するコンテキスト。
 * ThreeCanvas の外（通常 React ツリー）で useScrollUniforms() を呼び出し、
 * R3F ツリー内のコンポーネントがこのコンテキスト経由でアクセスする。
 */
const ScrollRefContext = createContext<RefObject<ScrollState> | undefined>(
  undefined,
);

export function useScrollRef(): RefObject<ScrollState> {
  const ref = use(ScrollRefContext);
  if (ref === undefined) {
    throw new Error("useScrollRef must be used within ThreeCanvas");
  }
  return ref;
}

/**
 * SSR ゲート + effectLevel チェック。
 * Three.js を直接 import しない（バンドルサイズ影響なし）。
 * effectLevel >= 3 && budget.allowThreeJs の場合のみ ThreeCanvasInner をロード。
 */

const ThreeCanvasInner = dynamic(
  () => import("./ThreeCanvasInner").then((mod) => mod.ThreeCanvasInner),
  { ssr: false },
);

export function ThreeCanvas({
  children,
  fallback,
  id,
  className,
  frameloop = "always",
  fov,
  cameraPosition,
}: ThreeCanvasProps) {
  const { effectLevel, budget, degradeTo } = useVisualEffects();
  const scrollRef = useScrollUniforms();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isInView, setIsInView] = useState(false);

  const shouldRenderThree = effectLevel >= 3 && budget.allowThreeJs;

  // IntersectionObserver でビューポート外を検知
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !shouldRenderThree) return;

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
  }, [shouldRenderThree]);

  return (
    <div ref={containerRef} id={id} className={className}>
      {shouldRenderThree && isInView ? (
        <ScrollRefContext.Provider value={scrollRef}>
          <ThreeCanvasInner
            id={id}
            className={className}
            frameloop={frameloop}
            fov={fov}
            cameraPosition={cameraPosition}
            fallback={fallback}
            scrollRef={scrollRef}
            degradeTo={degradeTo}
          >
            {children}
          </ThreeCanvasInner>
        </ScrollRefContext.Provider>
      ) : (
        (fallback ?? null)
      )}
    </div>
  );
}

"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

interface ParallaxLayerProps {
  readonly children: ReactNode;
  readonly speed?: number; // 0-1, default 0.15
  readonly className?: string;
}

export function ParallaxLayer({
  children,
  speed = 0.15,
  className = "",
}: ParallaxLayerProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Respect reduced motion
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    function handleScroll() {
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const scrollProgress = rect.top / window.innerHeight;
      const offset = scrollProgress * speed * 100;
      el.style.transform = `translateY(${offset}px)`;
    }

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener("scroll", handleScroll);
  }, [speed]);

  return (
    <div ref={ref} className={`will-change-transform ${className}`.trim()}>
      {children}
    </div>
  );
}

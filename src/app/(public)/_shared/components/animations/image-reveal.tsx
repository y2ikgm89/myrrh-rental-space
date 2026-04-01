"use client";

/**
 * ImageReveal — Clip-path reveal animation on scroll
 *
 * Reveals children (typically an image) with a directional clip-path wipe.
 * Respects prefers-reduced-motion.
 */

import { useRef, type ReactNode } from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "@/public/lib/gsap-config";
import { DURATION, EASE, SCROLL_TRIGGER } from "@/public/lib/animations";

interface ImageRevealProps {
  readonly children: ReactNode;
  readonly className?: string;
  readonly direction?: "left" | "right" | "top" | "bottom";
}

const clipPaths = {
  left: { from: "inset(0 100% 0 0)", to: "inset(0 0% 0 0)" },
  right: { from: "inset(0 0 0 100%)", to: "inset(0 0 0 0%)" },
  top: { from: "inset(100% 0 0 0)", to: "inset(0% 0 0 0)" },
  bottom: { from: "inset(0 0 100% 0)", to: "inset(0 0 0% 0)" },
} as const;

export function ImageReveal({
  children,
  className,
  direction = "left",
}: ImageRevealProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const el = containerRef.current;
      if (!el) return;

      gsap.matchMedia().add("(prefers-reduced-motion: no-preference)", () => {
        gsap.fromTo(
          el,
          { clipPath: clipPaths[direction].from },
          {
            clipPath: clipPaths[direction].to,
            duration: DURATION.hero,
            ease: EASE.outCubic,
            scrollTrigger: {
              trigger: el,
              ...SCROLL_TRIGGER.reveal,
            },
          },
        );
      });
    },
    { scope: containerRef },
  );

  return (
    <div ref={containerRef} className={className}>
      {children}
    </div>
  );
}

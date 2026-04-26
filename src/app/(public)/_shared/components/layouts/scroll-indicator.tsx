"use client";

/**
 * ScrollIndicator — Animated scroll hint at hero bottom
 *
 * Bouncing animation using GSAP to guide users to scroll down.
 */

import { useRef, type ReactElement } from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "@/public/lib/gsap-config";
import { EASE } from "@/public/lib/animations";

export function ScrollIndicator(): ReactElement {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;

      const mm = gsap.matchMedia();
      mm.add(
        {
          reduce: "(prefers-reduced-motion: reduce)",
          noPreference: "(prefers-reduced-motion: no-preference)",
        },
        (ctx) => {
          // ctx.conditions は GSAP matchMedia により常に提供される
          const { reduce } = ctx.conditions ?? {};
          gsap.to(el, {
            y: reduce ? 4 : 8,
            duration: 1.2,
            ease: EASE.inOutSine,
            repeat: -1,
            yoyo: true,
          });
        },
      );
    },
    { scope: ref },
  );

  return (
    <div
      ref={ref}
      className="flex flex-col items-center gap-2 text-muted-foreground"
    >
      <span className="text-xs uppercase tracking-[0.18em]">Scroll</span>
      <div className="h-10 w-px bg-gradient-to-b from-primary/50 to-transparent" />
    </div>
  );
}

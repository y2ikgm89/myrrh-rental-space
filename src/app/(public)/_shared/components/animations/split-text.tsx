"use client";

/**
 * SplitText — Scroll reveal animation for headings
 *
 * Renders text normally (no DOM splitting). GSAP animates the container
 * element with fade-up on scroll or on load.
 *
 * This avoids hydration mismatches, inline-block layout issues with
 * Japanese text, and invisible content when GSAP doesn't fire.
 */

import { useRef, type ReactElement, type ReactNode } from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "@/public/lib/gsap-config";
import { DURATION, EASE, REVEAL } from "@/public/lib/animations";

interface SplitTextProps {
  readonly children: ReactNode;
  readonly className?: string;
  readonly delay?: number;
  /** Whether to use ScrollTrigger. When false, animates immediately. */
  readonly trigger?: boolean;
}

export function SplitText({
  children,
  className,
  delay = 0,
  trigger = true,
}: SplitTextProps): ReactElement {
  const ref = useRef<HTMLSpanElement>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;

      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.fromTo(
          el,
          { y: REVEAL.fadeUp.y, opacity: REVEAL.fadeUp.opacity },
          {
            y: 0,
            opacity: 1,
            duration: DURATION.slow,
            ease: EASE.outQuart,
            delay,
            ...(trigger && {
              scrollTrigger: {
                trigger: el,
                start: "top 85%",
                toggleActions: "play none none none",
              },
            }),
          },
        );
      });
    },
    { scope: ref, dependencies: [trigger, delay] },
  );

  return (
    <span ref={ref} className={className}>
      {children}
    </span>
  );
}

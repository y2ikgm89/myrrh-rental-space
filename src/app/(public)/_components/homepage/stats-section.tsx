"use client";

import { useRef, type ReactElement } from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "@/public/lib/gsap-config";
import {
  DURATION,
  EASE,
  REVEAL,
  STAGGER,
  SCROLL_TRIGGER,
} from "@/public/lib/animations";

export interface StatItem {
  readonly value: string;
  readonly label: string;
}

export interface StatsSectionProps {
  readonly items: readonly StatItem[];
}

export const statsDefaultProps: StatsSectionProps = {
  items: [
    { value: "12", label: "Spaces" },
    { value: "2,400+", label: "Bookings" },
    { value: "98%", label: "Satisfaction" },
    { value: "4.8", label: "Rating" },
  ],
};

export function StatsSection({
  items = statsDefaultProps.items,
}: Partial<StatsSectionProps> = {}): ReactElement {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const items = ref.current?.querySelectorAll("[data-stat]");
        if (!items?.length) return;
        gsap.fromTo(
          items,
          { y: REVEAL.fadeUp.y * 0.5, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: DURATION.normal,
            ease: EASE.outQuart,
            stagger: STAGGER.element,
            scrollTrigger: { trigger: ref.current, ...SCROLL_TRIGGER.reveal },
          },
        );
      });
    },
    { scope: ref },
  );

  return (
    <section ref={ref} className="mx-auto max-w-[60rem] px-4 md:px-6">
      <div className="flex flex-wrap justify-center gap-x-10 gap-y-6 border-b border-t border-border py-8 md:gap-x-16 md:py-10">
        {items.map((stat) => (
          <div key={stat.label} data-stat="" className="text-center">
            <div className="font-heading text-[clamp(2rem,4vw,3rem)] font-light leading-none">
              {stat.value}
            </div>
            <div className="mt-2 text-[0.55rem] uppercase tracking-[0.18em] text-muted-foreground">
              {stat.label}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

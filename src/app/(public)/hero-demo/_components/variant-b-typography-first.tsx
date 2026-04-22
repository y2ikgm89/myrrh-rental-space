"use client";

import { useState, useRef } from "react";
import type { TouchEvent as ReactTouchEvent } from "react";
import Image from "next/image";
import { Button } from "@/public/components/design-system/button";
import { cn } from "@/shared/lib/cn";
import { COPY, DEMO_IMAGES } from "./shared";

const SWIPE_THRESHOLD_PX = 50;

/**
 * Variant B — Typography First
 * All text at top, portrait gallery with swipe + numbered pagination + dots below.
 */
export function VariantBTypographyFirst() {
  const [active, setActive] = useState(0);
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const count = DEMO_IMAGES.length;

  const handleTouchStart = (e: ReactTouchEvent<HTMLDivElement>) => {
    const t = e.touches[0];
    touchStartXRef.current = t?.clientX ?? null;
    touchStartYRef.current = t?.clientY ?? null;
  };

  const handleTouchEnd = (e: ReactTouchEvent<HTMLDivElement>) => {
    const sx = touchStartXRef.current;
    const sy = touchStartYRef.current;
    touchStartXRef.current = null;
    touchStartYRef.current = null;
    if (sx === null || sy === null) return;
    const t = e.changedTouches[0];
    if (!t) return;
    const dx = t.clientX - sx;
    const dy = t.clientY - sy;
    if (Math.abs(dx) < Math.abs(dy)) return;
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX) return;
    const next = (active + (dx < 0 ? 1 : -1) + count) % count;
    setActive(next);
  };

  return (
    <section className="bg-background">
      {/* Text block */}
      <div className="px-6 py-14">
        <p className="mb-6 text-[0.55rem] uppercase tracking-[0.18em] text-muted-foreground">
          {COPY.label}
        </p>
        <h1 className="text-hero font-heading font-light leading-[1.08] tracking-tight">
          {COPY.title}
        </h1>
        <div className="mt-6 h-px w-12 bg-accent" aria-hidden="true" />
        <p className="mt-6 max-w-[22rem] text-sm leading-[2.1] text-muted-foreground">
          {COPY.description}
        </p>
        <Button
          variant="editorial"
          href={COPY.buttonUrl}
          className="mt-8 text-xs uppercase tracking-[0.18em]"
        >
          {COPY.buttonText}
        </Button>
      </div>

      {/* Gallery */}
      <div
        className="relative aspect-[4/5] overflow-hidden bg-card"
        role="region"
        aria-roledescription="carousel"
        aria-label={`ヒーロー画像 — ${count}枚`}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {DEMO_IMAGES.map((img, i) => (
          <div
            key={img.url}
            className="absolute inset-0 transition-opacity duration-500"
            style={{ opacity: i === active ? 1 : 0 }}
            aria-hidden={i !== active}
          >
            <Image
              src={img.url}
              alt={i === active ? img.alt : ""}
              fill
              className="object-cover"
              sizes="100vw"
              priority={i === 0}
            />
          </div>
        ))}

        <div
          className="absolute top-6 right-6 z-10 text-[0.55rem] uppercase tracking-[0.18em] tabular-nums text-background/80"
          aria-hidden="true"
        >
          {String(active + 1).padStart(2, "0")}
          <span className="mx-1 text-background/40">/</span>
          {String(count).padStart(2, "0")}
        </div>

        <div
          className="absolute bottom-6 left-1/2 z-10 flex -translate-x-1/2 gap-2"
          role="tablist"
          aria-label="画像選択"
        >
          {DEMO_IMAGES.map((img, i) => (
            <button
              key={img.url}
              type="button"
              role="tab"
              aria-selected={i === active}
              aria-label={`画像 ${i + 1}`}
              onClick={() => setActive(i)}
              className={cn(
                "h-1.5 rounded-full transition-all duration-500",
                i === active
                  ? "w-6 bg-background"
                  : "w-1.5 bg-background/50 hover:bg-background/70",
              )}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

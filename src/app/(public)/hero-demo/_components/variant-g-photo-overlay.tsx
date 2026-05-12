"use client";

import { useRef, useState } from "react";
import type { TouchEvent as ReactTouchEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/shared/lib/cn";
import { COPY, DEMO_IMAGES } from "./shared";

const SWIPE_THRESHOLD_PX = 50;

/**
 * Variant G — Photo Overlay
 * Full-bleed image carousel with text overlay.
 * References: Aesop, Kinfolk mobile, total-therapy-myrrh.net.
 * Subtle foreground-opacity scrims (top + bottom) preserve image clarity while
 * ensuring WCAG AA text contrast. CTA is an underline link (not Button) to
 * avoid the "editorial Button color override" anti-pattern.
 */
export function VariantGPhotoOverlay() {
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
    setActive((active + (dx < 0 ? 1 : -1) + count) % count);
  };

  return (
    <section
      className="relative min-h-[90svh] overflow-hidden bg-card"
      role="region"
      aria-roledescription="carousel"
      aria-label={`ヒーロー画像 — ${count}枚`}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Image layers (crossfade on change) */}
      {DEMO_IMAGES.map((img, i) => (
        <div
          key={img.url}
          className="absolute inset-0 transition-opacity duration-700"
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

      {/* Top scrim — label readability */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-foreground/45 to-transparent"
        aria-hidden="true"
      />

      {/* Bottom scrim — title/body/CTA readability */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-foreground/75 via-foreground/30 to-transparent"
        aria-hidden="true"
      />

      {/* Top overlay: label + numbered pagination */}
      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-6 pt-6">
        <p className="text-[0.6875rem] uppercase tracking-[0.18em] text-background/90">
          {COPY.label}
        </p>
        <p
          className="text-[0.6875rem] uppercase tracking-[0.18em] tabular-nums text-background/90"
          aria-hidden="true"
        >
          {String(active + 1).padStart(2, "0")}
          <span className="mx-1 text-background/50">/</span>
          {String(count).padStart(2, "0")}
        </p>
      </div>

      {/* Bottom overlay: title + divider + description + CTA link */}
      <div className="absolute inset-x-0 bottom-0 z-10 px-6 pb-20">
        <h1 className="text-hero font-heading font-light leading-[1.08] tracking-tight text-background">
          {COPY.title}
        </h1>
        <div className="mt-5 h-px w-12 bg-accent" aria-hidden="true" />
        <p className="mt-5 max-w-[22rem] text-sm leading-[2.1] text-background/90">
          {COPY.description}
        </p>
        <Link
          href={COPY.buttonUrl}
          className="mt-8 inline-flex items-center gap-2 border-b border-background/60 pb-1 text-xs uppercase tracking-[0.18em] text-background transition-colors hover:border-accent hover:text-accent"
        >
          {COPY.buttonText}
          <span aria-hidden="true">→</span>
        </Link>
      </div>

      {/* Dots — bottom center (below CTA, within scrim bottom padding zone) */}
      {count > 1 ? (
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
      ) : null}
    </section>
  );
}

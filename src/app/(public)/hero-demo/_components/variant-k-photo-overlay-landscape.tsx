"use client";

import { useRef, useState } from "react";
import type { TouchEvent as ReactTouchEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/shared/lib/cn";
import { COPY, DEMO_IMAGES } from "./shared";

const SWIPE_THRESHOLD_PX = 50;

/**
 * Variant K — Photo Overlay Landscape
 * Horizontal (aspect 3:2) landscape version of G. Minimal overlay on image
 * (label + pagination top, title + divider bottom), description + CTA on
 * white background below. Carousel with swipe + dots like G.
 */
export function VariantKPhotoOverlayLandscape() {
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
    <section className="bg-background">
      {/* Landscape image carousel — clear image + gradient scrim + strong shadows */}
      <div
        className="relative aspect-[4/3] overflow-hidden bg-card"
        role="region"
        aria-roledescription="carousel"
        aria-label={`ヒーロー画像 — ${count}枚`}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Image layers */}
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

        {/* Top scrim — gradient behind label */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-foreground/70 via-foreground/30 to-transparent"
          aria-hidden="true"
        />

        {/* Bottom scrim — stronger gradient for title readability, no blur */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-foreground/90 via-foreground/45 to-transparent"
          aria-hidden="true"
        />

        {/* Top: label + pagination — stroke outline for image-agnostic contrast */}
        <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-6 pt-6">
          <p
            className="text-[0.6875rem] uppercase tracking-[0.18em] text-background"
            style={{
              paintOrder: "stroke fill",
              WebkitTextStroke: "0.4px rgba(0,0,0,0.5)",
              textShadow: "0 1px 3px rgba(0,0,0,0.6)",
            }}
          >
            {COPY.label}
          </p>
          <p
            className="text-[0.6875rem] uppercase tracking-[0.18em] tabular-nums text-background"
            aria-hidden="true"
            style={{
              paintOrder: "stroke fill",
              WebkitTextStroke: "0.4px rgba(0,0,0,0.5)",
              textShadow: "0 1px 3px rgba(0,0,0,0.6)",
            }}
          >
            {String(active + 1).padStart(2, "0")}
            <span className="mx-1 text-background/70">/</span>
            {String(count).padStart(2, "0")}
          </p>
        </div>

        {/* Bottom: title + divider — stroke outline + layered shadow = readable on ANY image */}
        <div className="absolute inset-x-0 bottom-0 z-10 px-6 pb-10">
          <h1
            className="text-[clamp(2.25rem,10vw,3.5rem)] font-heading font-light leading-[1.08] tracking-[-0.01em] text-background"
            style={{
              paintOrder: "stroke fill",
              WebkitTextStroke: "0.5px rgba(0,0,0,0.45)",
              textShadow:
                "0 1px 2px rgba(0,0,0,0.6), 0 2px 12px rgba(0,0,0,0.5), 0 0 24px rgba(0,0,0,0.3)",
            }}
          >
            {COPY.title}
          </h1>
          <div
            className="mt-5 h-px w-12 bg-accent drop-shadow-[0_1px_3px_rgba(0,0,0,0.4)]"
            aria-hidden="true"
          />
        </div>

        {/* Dots — bottom center, inside image bounds */}
        {count > 1 ? (
          <div
            className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 gap-2"
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
                  "h-1.5 rounded-full shadow-[0_1px_3px_rgba(0,0,0,0.4)] transition-all duration-500",
                  i === active
                    ? "w-6 bg-background"
                    : "w-1.5 bg-background/60 hover:bg-background/85",
                )}
              />
            ))}
          </div>
        ) : null}
      </div>

      {/* Below image: description + CTA on white */}
      <div className="px-6 pt-8 pb-14">
        <p className="max-w-[22rem] text-sm leading-[2.1] text-muted-foreground">
          {COPY.description}
        </p>
        <Link
          href={COPY.buttonUrl}
          className="mt-8 inline-flex items-center gap-2 border-b border-foreground/60 pb-1 text-xs uppercase tracking-[0.18em] text-foreground transition-colors hover:border-accent hover:text-accent"
        >
          {COPY.buttonText}
          <span aria-hidden="true">→</span>
        </Link>
      </div>
    </section>
  );
}

"use client";

import Image from "next/image";
import { Button } from "@/public/components/design-system/button";
import { COPY, DEMO_IMAGES } from "./shared";

/**
 * Variant E — Horizontal Peek
 * Text hero + horizontal scroll gallery with peek of adjacent card.
 * Uses CSS scroll-snap for mobile-native swipe feel.
 */
export function VariantEHorizontalPeek() {
  return (
    <section className="bg-background">
      {/* Text hero */}
      <div className="px-6 pt-14 pb-8">
        <p className="mb-6 text-[0.6875rem] uppercase tracking-[0.18em] text-muted-foreground">
          {COPY.label}
        </p>
        <h1 className="text-hero font-heading font-light leading-[1.08] tracking-tight">
          {COPY.title}
        </h1>
        <div className="mt-6 h-px w-12 bg-accent" aria-hidden="true" />
        <p className="mt-6 max-w-[22rem] text-sm leading-[2.1] text-muted-foreground">
          {COPY.description}
        </p>
      </div>

      {/* Horizontal scroll gallery */}
      <div
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto px-6 pb-8 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
        role="region"
        aria-label={`ヒーロー画像 — ${DEMO_IMAGES.length}枚（横スクロール）`}
      >
        {DEMO_IMAGES.map((img, i) => (
          <figure
            key={img.url}
            className="relative flex-shrink-0 basis-[85%] snap-start"
          >
            <div className="relative aspect-[3/4] overflow-hidden bg-card">
              <Image
                src={img.url}
                alt={img.alt}
                fill
                className="object-cover"
                sizes="85vw"
                priority={i === 0}
              />
              <span
                className="absolute top-4 left-4 z-10 text-[0.6875rem] uppercase tracking-[0.18em] tabular-nums text-background/80"
                aria-hidden="true"
              >
                {String(i + 1).padStart(2, "0")}
                <span className="mx-1 text-background/40">/</span>
                {String(DEMO_IMAGES.length).padStart(2, "0")}
              </span>
            </div>
          </figure>
        ))}
      </div>

      {/* CTA below */}
      <div className="px-6 pb-14">
        <Button
          variant="editorial"
          href={COPY.buttonUrl}
          className="text-xs uppercase tracking-[0.18em]"
        >
          {COPY.buttonText}
        </Button>
      </div>
    </section>
  );
}

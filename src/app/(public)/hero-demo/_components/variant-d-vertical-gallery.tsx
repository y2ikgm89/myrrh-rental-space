"use client";

import Image from "next/image";
import { Button } from "@/public/components/design-system/button";
import { cn } from "@/shared/lib/cn";
import { COPY, DEMO_IMAGES } from "./shared";

const ASPECTS = ["aspect-[3/2]", "aspect-[4/5]", "aspect-[16/10]"] as const;

/**
 * Variant D — Vertical Gallery
 * Text hero + 3 stacked images with varying aspect ratios and captions.
 */
export function VariantDVerticalGallery() {
  return (
    <section className="bg-background">
      {/* Text hero */}
      <div className="px-6 pt-14 pb-10">
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

      {/* Stacked images with captions */}
      <div className="flex flex-col">
        {DEMO_IMAGES.map((img, i) => {
          const aspect = ASPECTS[i] ?? "aspect-[3/2]";
          return (
            <figure key={img.url} className="border-t border-border">
              <div className={cn("relative overflow-hidden bg-card", aspect)}>
                <Image
                  src={img.url}
                  alt={img.alt}
                  fill
                  className="object-cover"
                  sizes="100vw"
                  priority={i === 0}
                />
              </div>
              <figcaption className="flex items-center justify-between px-6 py-4">
                <span className="text-[0.55rem] uppercase tracking-[0.18em] text-accent tabular-nums">
                  Plate {String(i + 1).padStart(2, "0")}
                </span>
                <span className="max-w-[60%] truncate text-[0.55rem] uppercase tracking-[0.15em] text-muted-foreground">
                  {img.alt}
                </span>
              </figcaption>
            </figure>
          );
        })}
      </div>
    </section>
  );
}

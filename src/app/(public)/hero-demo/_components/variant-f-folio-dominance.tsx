"use client";

import Image from "next/image";
import { Button } from "@/public/components/design-system/button";
import { COPY, DEMO_IMAGES } from "./shared";

/**
 * Variant F — Folio Dominance
 * Large serif italic "01" as visual anchor (Kinfolk Issue style).
 * Title becomes supporting element, image as inset plate.
 */
export function VariantFFolioDominance() {
  const image = DEMO_IMAGES[0];
  if (!image) return null;

  return (
    <section className="flex flex-col bg-background">
      {/* Masthead with large folio number */}
      <div className="px-6 pt-12 pb-6">
        <div className="flex items-center justify-between">
          <p className="text-[0.55rem] uppercase tracking-[0.18em] text-muted-foreground">
            Spring 2026
          </p>
          <p className="text-[0.55rem] uppercase tracking-[0.18em] text-muted-foreground">
            Volume One
          </p>
        </div>

        <div className="mt-2 flex items-start justify-center">
          <span
            className="text-[clamp(8rem,42vw,16rem)] font-heading font-light italic leading-[0.85] text-accent"
            aria-hidden="true"
          >
            01
          </span>
        </div>

        <div className="mx-auto mt-2 h-px w-24 bg-accent" aria-hidden="true" />
      </div>

      {/* Image inset */}
      <div className="px-6">
        <div className="relative aspect-[4/5] overflow-hidden bg-card">
          <Image
            src={image.url}
            alt={image.alt}
            fill
            className="object-cover"
            sizes="calc(100vw - 3rem)"
            priority
          />
        </div>
      </div>

      {/* Title + body below image */}
      <div className="px-6 pt-10 pb-14">
        <h1 className="text-h2 font-heading font-light leading-[1.15] tracking-tight">
          {COPY.title}
        </h1>
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
    </section>
  );
}

"use client";

import Image from "next/image";
import { Button } from "@/public/components/design-system/button";
import { COPY, DEMO_IMAGES } from "./shared";

/**
 * Variant C — Magazine Cover
 * Print magazine cover structure: masthead band + centered serif title +
 * inset image with side margins + footer credit band.
 */
export function VariantCMagazineCover() {
  const image = DEMO_IMAGES[0];
  if (!image) return null;

  return (
    <section className="flex flex-col bg-background">
      {/* Masthead band */}
      <div className="flex items-center justify-between border-b border-border px-6 py-4">
        <p className="text-[0.6875rem] uppercase tracking-[0.18em] text-muted-foreground">
          Issue 01
        </p>
        <p className="text-[0.6875rem] uppercase tracking-[0.2em] text-accent font-heading italic">
          Myrrh
        </p>
        <p className="text-[0.6875rem] uppercase tracking-[0.18em] text-muted-foreground">
          Spring 2026
        </p>
      </div>

      {/* Centered title */}
      <div className="px-8 pt-12 pb-10 text-center">
        <p className="mb-6 text-[0.6875rem] uppercase tracking-[0.25em] text-muted-foreground">
          A Journal of Quiet Spaces
        </p>
        <h1 className="text-hero font-heading font-light italic leading-[1.02] tracking-[-0.02em]">
          {COPY.title}
        </h1>
        <div className="mx-auto mt-8 h-px w-16 bg-accent" aria-hidden="true" />
      </div>

      {/* Inset image */}
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

      {/* Footer credit band */}
      <div className="mt-8 flex flex-col items-center gap-4 border-t border-border px-6 py-6 text-center">
        <p className="max-w-[22rem] text-sm leading-[1.9] text-muted-foreground">
          {COPY.description}
        </p>
        <Button
          variant="editorial"
          href={COPY.buttonUrl}
          className="mt-2 text-xs uppercase tracking-[0.18em]"
        >
          {COPY.buttonText}
        </Button>
        <p className="mt-4 text-[0.6875rem] uppercase tracking-[0.18em] text-muted-foreground">
          Photography — Myrrh Studio, 2026
        </p>
      </div>
    </section>
  );
}

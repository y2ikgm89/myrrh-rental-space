"use client";

import Image from "next/image";
import { Button } from "@/public/components/design-system/button";
import { COPY, DEMO_IMAGES } from "./shared";

/**
 * Variant A — Editorial Sandwich
 * text (label + title + divider) → portrait image → text (description + CTA)
 */
export function VariantAEditorialSandwich() {
  const image = DEMO_IMAGES[0];
  if (!image) return null;

  return (
    <section className="bg-background">
      {/* Lead: label + title + divider */}
      <div className="px-6 pt-14 pb-8">
        <p className="mb-6 text-[0.55rem] uppercase tracking-[0.18em] text-muted-foreground">
          {COPY.label}
        </p>
        <h1 className="text-hero font-heading font-light leading-[1.08] tracking-tight">
          {COPY.title}
        </h1>
        <div className="mt-6 h-px w-12 bg-accent" aria-hidden="true" />
      </div>

      {/* Portrait image */}
      <div className="relative aspect-[4/5] overflow-hidden bg-card">
        <Image
          src={image.url}
          alt={image.alt}
          fill
          className="object-cover"
          sizes="100vw"
          priority
        />
      </div>

      {/* Body: description + CTA */}
      <div className="px-6 pt-8 pb-14">
        <p className="max-w-[22rem] text-sm leading-[2.1] text-muted-foreground">
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

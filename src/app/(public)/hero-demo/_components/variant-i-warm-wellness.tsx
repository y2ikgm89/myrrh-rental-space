"use client";

import Image from "next/image";
import Link from "next/link";
import { COPY, DEMO_IMAGES } from "./shared";

/**
 * Variant I — Warm Wellness Card
 * Warm cream background (bg-surface) + bronze-framed image + serif heading.
 * References: spa/wellness industry patterns, integrates with therapy brand
 * heritage (total-therapy-myrrh.net).
 */
export function VariantIWarmWellness() {
  const image = DEMO_IMAGES[0];
  if (!image) return null;

  return (
    <section className="relative bg-surface px-6 py-16">
      {/* Top eyebrow — bronze */}
      <p className="mb-2 text-[0.55rem] uppercase tracking-[0.25em] text-accent">
        Vol. 01 — Spring 2026
      </p>

      {/* Serif title */}
      <h1 className="text-hero font-heading font-light italic leading-[1.08] tracking-tight text-foreground">
        {COPY.title}
      </h1>

      <div className="mt-5 h-px w-16 bg-accent" aria-hidden="true" />

      {/* Framed image — bronze border */}
      <div className="relative mt-10">
        {/* Bronze frame offset */}
        <div
          className="absolute -top-2 -right-2 -bottom-2 -left-2 border border-accent/40"
          aria-hidden="true"
        />
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

      {/* Body */}
      <p className="mt-12 max-w-[22rem] text-sm leading-[2.1] text-muted-foreground">
        {COPY.description}
      </p>

      {/* CTA link with bronze hover */}
      <Link
        href={COPY.buttonUrl}
        className="mt-8 inline-flex items-center gap-2 border-b border-foreground/60 pb-1 text-xs uppercase tracking-[0.18em] text-foreground transition-colors hover:border-accent hover:text-accent"
      >
        {COPY.buttonText}
        <span aria-hidden="true">→</span>
      </Link>
    </section>
  );
}

"use client";

import Image from "next/image";
import Link from "next/link";
import { COPY, DEMO_IMAGES } from "./shared";

/**
 * Variant J — Hero Pair (Reference Style)
 * Matches total-therapy-myrrh.net structure: landscape image on top +
 * text block below, no overlay. "Juxtaposed" (並置) rather than layered.
 * The most brand-integrated option with the owner's existing therapy site.
 */
export function VariantJHeroPair() {
  const image = DEMO_IMAGES[0];
  if (!image) return null;

  return (
    <section className="bg-background">
      {/* Top: landscape image, full-width */}
      <div className="relative aspect-[3/2] overflow-hidden bg-card">
        <Image
          src={image.url}
          alt={image.alt}
          fill
          className="object-cover"
          sizes="100vw"
          priority
        />
      </div>

      {/* Bottom: text block */}
      <div className="px-6 pt-10 pb-14">
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

        {/* CTA — reference site uses text link style ("サロンのこだわり" pattern) */}
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

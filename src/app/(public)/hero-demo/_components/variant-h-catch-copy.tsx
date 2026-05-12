"use client";

import Image from "next/image";
import Link from "next/link";
import { DEMO_IMAGES } from "./shared";

/**
 * Variant H — Catch Copy Dominance
 * Japanese catch copy as hero (SWELL / JIN:R corporate style).
 * Large serif 「静けさが、仕事をする。」dominates, image is controlled,
 * scroll indicator guides downward.
 */
export function VariantHCatchCopy() {
  const image = DEMO_IMAGES[0];
  if (!image) return null;

  return (
    <section className="flex min-h-[95svh] flex-col bg-background">
      {/* Top band: small English meta */}
      <div className="flex items-center justify-between px-6 pt-6">
        <p className="text-[0.6875rem] uppercase tracking-[0.18em] text-muted-foreground">
          Volume One
        </p>
        <p className="text-[0.6875rem] uppercase tracking-[0.18em] text-muted-foreground">
          Spring 2026
        </p>
      </div>

      {/* Japanese catch copy — dominant */}
      <div className="px-6 pt-12">
        <p className="mb-4 text-[0.6875rem] uppercase tracking-[0.25em] text-accent">
          — Myrrh Rental Space
        </p>
        <h1
          className="font-heading text-[clamp(2.5rem,10vw,4rem)] leading-[1.35] tracking-[0.02em] text-foreground"
          style={{ writingMode: "horizontal-tb" }}
        >
          静けさが、
          <br />
          仕事をする。
        </h1>
        <p className="mt-6 text-sm font-light italic tracking-wide text-muted-foreground">
          Where silence works.
        </p>
        <div className="mt-8 h-px w-16 bg-accent" aria-hidden="true" />
      </div>

      {/* Controlled image — smaller, framed */}
      <div className="mt-10 px-6">
        <div className="relative aspect-[16/10] overflow-hidden bg-card">
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

      {/* Body + CTA */}
      <div className="flex-1 px-6 pt-8 pb-8">
        <p className="max-w-[22rem] text-sm leading-[2.1] text-muted-foreground">
          Myrrh
          は光と余白を大切にした、思考のためのレンタルスペースです。静けさの中で自分と向き合う時間を。
        </p>
        <Link
          href="/reservation"
          className="mt-8 inline-flex items-center gap-2 border-b border-foreground/60 pb-1 text-xs uppercase tracking-[0.18em] text-foreground transition-colors hover:border-accent hover:text-accent"
        >
          Reserve a space
          <span aria-hidden="true">→</span>
        </Link>
      </div>

      {/* Scroll indicator — SWELL convention */}
      <div className="flex items-center justify-center gap-3 pb-8">
        <span className="text-[0.6875rem] uppercase tracking-[0.3em] text-muted-foreground">
          Scroll
        </span>
        <div className="h-8 w-px bg-foreground/30" aria-hidden="true" />
      </div>
    </section>
  );
}

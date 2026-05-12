"use client";

import { useState } from "react";
import { cn } from "@/shared/lib/cn";
import { VARIANTS, type VariantMeta } from "./_components/shared";
import { VariantAEditorialSandwich } from "./_components/variant-a-editorial-sandwich";
import { VariantBTypographyFirst } from "./_components/variant-b-typography-first";
import { VariantCMagazineCover } from "./_components/variant-c-magazine-cover";
import { VariantDVerticalGallery } from "./_components/variant-d-vertical-gallery";
import { VariantEHorizontalPeek } from "./_components/variant-e-horizontal-peek";
import { VariantFFolioDominance } from "./_components/variant-f-folio-dominance";
import { VariantGPhotoOverlay } from "./_components/variant-g-photo-overlay";
import { VariantHCatchCopy } from "./_components/variant-h-catch-copy";
import { VariantIWarmWellness } from "./_components/variant-i-warm-wellness";
import { VariantJHeroPair } from "./_components/variant-j-hero-pair";
import { VariantKPhotoOverlayLandscape } from "./_components/variant-k-photo-overlay-landscape";

type VariantId = VariantMeta["id"];

const COMPONENTS: Record<VariantId, () => React.ReactNode> = {
  a: VariantAEditorialSandwich,
  b: VariantBTypographyFirst,
  c: VariantCMagazineCover,
  d: VariantDVerticalGallery,
  e: VariantEHorizontalPeek,
  f: VariantFFolioDominance,
  g: VariantGPhotoOverlay,
  h: VariantHCatchCopy,
  i: VariantIWarmWellness,
  j: VariantJHeroPair,
  k: VariantKPhotoOverlayLandscape,
};

export default function HeroDemoPage() {
  const [active, setActive] = useState<VariantId>("a");
  const meta = VARIANTS.find((v) => v.id === active);
  const Component = COMPONENTS[active];

  return (
    <div className="bg-card">
      {/* Sticky variant switcher */}
      <nav
        className="sticky top-[var(--header-height)] z-30 border-b border-border bg-background/95 backdrop-blur"
        aria-label="バリアント切替"
      >
        <div className="mx-auto flex max-w-md items-center gap-2 overflow-x-auto px-4 py-3 md:max-w-[420px]">
          <span className="shrink-0 text-[0.6875rem] uppercase tracking-[0.18em] text-muted-foreground">
            Variant
          </span>
          {VARIANTS.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => setActive(v.id)}
              aria-pressed={active === v.id}
              className={cn(
                "shrink-0 border px-3 py-1.5 text-xs uppercase tracking-[0.15em] transition-colors",
                active === v.id
                  ? "border-foreground bg-foreground text-background"
                  : "border-border bg-background text-muted-foreground hover:border-foreground hover:text-foreground",
              )}
            >
              {v.id.toUpperCase()}
            </button>
          ))}
        </div>
      </nav>

      {/* Intro (shown only at top, scrolls away) */}
      <header className="mx-auto max-w-md border-x border-border bg-background px-6 py-8 md:max-w-[420px]">
        <p className="mb-2 text-[0.6875rem] uppercase tracking-[0.18em] text-accent">
          Hero Section Demo
        </p>
        <h1 className="mb-3 font-heading text-2xl font-light leading-tight">
          モバイル ヒーロー デザイン比較
        </h1>
        <p className="text-sm leading-[1.8] text-muted-foreground">
          モバイル viewport に最適化した 6
          種類のヒーローデザイン案。上部のボタンで切替、スクロールで詳細解説を確認。
        </p>
      </header>

      {/* Variant preview — mobile-width container */}
      <div
        key={active}
        className="mx-auto max-w-md border-x border-border bg-background md:max-w-[420px]"
      >
        <Component />
      </div>

      {/* Rationale panel */}
      {meta ? (
        <section
          className="mx-auto max-w-md border-x border-t border-border bg-card px-6 py-10 md:max-w-[420px]"
          aria-label="デザインの解説"
        >
          <p className="mb-2 text-[0.6875rem] uppercase tracking-[0.18em] text-accent">
            Variant {active.toUpperCase()}
          </p>
          <h2 className="mb-2 font-heading text-2xl font-light leading-tight">
            {meta.name}
          </h2>
          <p className="mb-5 text-[0.6875rem] uppercase tracking-[0.18em] text-muted-foreground">
            {meta.tagline}
          </p>
          <p className="mb-8 text-sm leading-[1.9] text-muted-foreground">
            {meta.description}
          </p>

          <div className="grid grid-cols-2 gap-6 border-t border-border pt-6">
            <div>
              <p className="mb-3 text-[0.6875rem] uppercase tracking-[0.18em] text-muted-foreground">
                Pros
              </p>
              <ul className="space-y-2 text-xs leading-[1.7] text-foreground">
                {meta.pros.map((pro) => (
                  <li key={pro} className="flex gap-2">
                    <span className="text-accent" aria-hidden="true">
                      +
                    </span>
                    <span>{pro}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="mb-3 text-[0.6875rem] uppercase tracking-[0.18em] text-muted-foreground">
                Cons
              </p>
              <ul className="space-y-2 text-xs leading-[1.7] text-muted-foreground">
                {meta.cons.map((con) => (
                  <li key={con} className="flex gap-2">
                    <span aria-hidden="true">−</span>
                    <span>{con}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      ) : null}

      {/* Bottom spacer */}
      <div
        className="mx-auto h-16 max-w-md border-x border-border bg-card md:max-w-[420px]"
        aria-hidden="true"
      />
    </div>
  );
}

"use client";

import { useState } from "react";
import { cn } from "@/shared/lib/cn";
import { VARIANTS, type VariantMeta } from "./_components/shared";
import { VariantAHeroPrice } from "./_components/variant-a-hero-price";
import { VariantBEditorialSequenced } from "./_components/variant-b-editorial-sequenced";
import { VariantCSplitHeroCard } from "./_components/variant-c-split-hero-card";
import { VariantDMinimalWhitespace } from "./_components/variant-d-minimal-whitespace";
import { VariantETimeline } from "./_components/variant-e-timeline";
import { VariantFBentoGrid } from "./_components/variant-f-bento-grid";

type VariantId = VariantMeta["id"];

const COMPONENTS: Record<VariantId, () => React.ReactNode> = {
  a: VariantAHeroPrice,
  b: VariantBEditorialSequenced,
  c: VariantCSplitHeroCard,
  d: VariantDMinimalWhitespace,
  e: VariantETimeline,
  f: VariantFBentoGrid,
};

export default function EventInfoPanelDemoPage() {
  const [mode, setMode] = useState<"compare" | "focus">("compare");
  const [active, setActive] = useState<VariantId>("a");
  const meta = VARIANTS.find((v) => v.id === active);
  const Component = COMPONENTS[active];

  return (
    <div className="bg-card">
      <nav
        className="sticky top-[var(--header-height)] z-30 border-b border-border bg-background/95 backdrop-blur"
        aria-label="表示モード切替"
      >
        <div className="mx-auto flex max-w-6xl items-center gap-3 overflow-x-auto px-4 py-3">
          <span className="shrink-0 text-[0.6875rem] uppercase tracking-[0.18em] text-muted-foreground">
            View
          </span>
          <button
            type="button"
            onClick={() => setMode("compare")}
            aria-pressed={mode === "compare"}
            className={cn(
              "shrink-0 border px-3 py-1.5 text-xs uppercase tracking-[0.15em] transition-colors",
              mode === "compare"
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-background text-muted-foreground hover:border-foreground hover:text-foreground",
            )}
          >
            Compare 6
          </button>
          <button
            type="button"
            onClick={() => setMode("focus")}
            aria-pressed={mode === "focus"}
            className={cn(
              "shrink-0 border px-3 py-1.5 text-xs uppercase tracking-[0.15em] transition-colors",
              mode === "focus"
                ? "border-foreground bg-foreground text-background"
                : "border-border bg-background text-muted-foreground hover:border-foreground hover:text-foreground",
            )}
          >
            Focus
          </button>
          {mode === "focus" ? (
            <>
              <span aria-hidden="true" className="mx-2 text-border">
                |
              </span>
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
            </>
          ) : null}
        </div>
      </nav>

      <header className="mx-auto max-w-6xl px-6 py-10">
        <p className="mb-2 text-[0.6875rem] uppercase tracking-[0.18em] text-accent">
          Event Info Panel Demo
        </p>
        <h1 className="mb-3 font-heading text-3xl font-light leading-tight">
          イベント詳細 情報パネル デザイン比較
        </h1>
        <p className="max-w-prose text-sm leading-[1.8] text-muted-foreground">
          イベント詳細ページ右サイドの sticky 情報パネルの 6
          つのデザイン方向性を比較。Compare で全 6 つを並べて視覚比較、Focus で
          1 variant 単独 + Pros/Cons 解説を確認できます。
        </p>
      </header>

      {mode === "compare" ? (
        <section
          className="mx-auto max-w-6xl px-6 pb-20"
          aria-label="全 6 variant の比較"
        >
          <div className="@container grid grid-cols-1 gap-8 @md:grid-cols-2 @3xl:grid-cols-3">
            {VARIANTS.map((variant) => {
              const VComp = COMPONENTS[variant.id];
              return (
                <article
                  key={variant.id}
                  className="flex flex-col gap-4"
                  aria-label={`Variant ${variant.id.toUpperCase()}: ${variant.name}`}
                >
                  <header>
                    <p className="text-[0.6875rem] uppercase tracking-[0.18em] text-accent">
                      Variant {variant.id.toUpperCase()}
                    </p>
                    <h2 className="mt-1 font-heading text-xl font-light leading-tight">
                      {variant.name}
                    </h2>
                    <p className="mt-1 text-[0.6875rem] uppercase tracking-[0.18em] text-muted-foreground">
                      {variant.tagline}
                    </p>
                  </header>
                  <div className="bg-card p-4">
                    <VComp />
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : (
        <section
          className="mx-auto max-w-6xl px-6 pb-20"
          aria-label="単一 variant フォーカス"
        >
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-[400px_1fr]">
            <div key={active} className="bg-card p-6">
              <Component />
            </div>
            {meta ? (
              <div>
                <p className="text-[0.6875rem] uppercase tracking-[0.18em] text-accent">
                  Variant {active.toUpperCase()}
                </p>
                <h2 className="mt-1 font-heading text-2xl font-light leading-tight">
                  {meta.name}
                </h2>
                <p className="mt-1 text-[0.6875rem] uppercase tracking-[0.18em] text-muted-foreground">
                  {meta.tagline}
                </p>
                <p className="mt-5 text-sm leading-[1.9] text-muted-foreground">
                  {meta.description}
                </p>
                <div className="mt-8 grid grid-cols-2 gap-6 border-t border-border pt-6">
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
              </div>
            ) : null}
          </div>
        </section>
      )}
    </div>
  );
}

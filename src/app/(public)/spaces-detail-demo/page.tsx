import type { Metadata } from "next";
import type { ReactElement } from "react";
import { VARIANTS } from "./_components/shared";
import { VariantAAirbnbMosaic } from "./_components/variant-a-airbnb-mosaic";
import { VariantBBookingHeroWidget } from "./_components/variant-b-booking-hero-widget";
import { VariantCEditorialRefined } from "./_components/variant-c-editorial-refined";
import { VariantDTabNavigation } from "./_components/variant-d-tab-navigation";

export const metadata: Metadata = {
  title: "スペース詳細ページ デザイン比較",
  robots: { index: false, follow: false },
};

const COMPONENTS: Record<(typeof VARIANTS)[number]["id"], () => ReactElement> =
  {
    a: VariantAAirbnbMosaic,
    b: VariantBBookingHeroWidget,
    c: VariantCEditorialRefined,
    d: VariantDTabNavigation,
  };

export default function SpacesDetailDemoPage(): ReactElement {
  return (
    <div className="bg-card">
      {/* Sticky variant index */}
      <nav
        className="sticky top-[var(--header-height)] z-30 border-b border-border bg-background/95 backdrop-blur"
        aria-label="バリアント一覧"
      >
        <div className="mx-auto flex max-w-[var(--container-max)] items-center gap-2 overflow-x-auto px-4 py-3">
          <span className="shrink-0 text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Variants
          </span>
          {VARIANTS.map((v) => (
            <a
              key={v.id}
              href={`#variant-${v.id}`}
              className="inline-flex min-h-11 shrink-0 items-center border border-border bg-background px-3 text-xs uppercase tracking-[0.15em] text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
            >
              {v.id.toUpperCase()} — {v.name}
            </a>
          ))}
        </div>
      </nav>

      {/* Page intro */}
      <header className="mx-auto max-w-[var(--container-max)] px-6 py-12 md:py-16">
        <p className="mb-3 text-xs uppercase tracking-[0.18em] text-accent">
          Spaces Detail Page Demo
        </p>
        <h1 className="font-heading text-3xl font-light leading-tight tracking-tight md:text-4xl">
          スペース詳細ページ デザイン比較
        </h1>
        <p className="mt-5 max-w-[var(--prose-medium)] text-sm leading-[1.9] text-muted-foreground">
          現状の Editorial Magazine pattern を改良する案として、4
          種類のスペース詳細 UX パターンを並列比較。各 variant
          は固定ダミーデータ (スペース 1 件)
          で同条件評価。お好みの方向性をお選びください。
        </p>
      </header>

      {/* All variants in vertical sequence */}
      <div className="border-t border-border">
        {VARIANTS.map((v) => {
          const Component = COMPONENTS[v.id];
          return (
            <section
              key={v.id}
              id={`variant-${v.id}`}
              aria-labelledby={`variant-${v.id}-title`}
              className="scroll-mt-[calc(var(--header-height)+4rem)] border-b border-border"
            >
              {/* Variant meta header */}
              <header className="bg-foreground px-6 py-8 text-background md:px-12 md:py-10">
                <div className="mx-auto max-w-[var(--container-max)]">
                  <p className="text-xs uppercase tracking-[0.24em] text-background/60">
                    Variant {v.id.toUpperCase()}
                  </p>
                  <h2
                    id={`variant-${v.id}-title`}
                    className="mt-2 font-heading text-3xl font-light leading-tight tracking-tight md:text-4xl"
                  >
                    {v.name}
                  </h2>
                  <p className="mt-2 text-xs uppercase tracking-[0.18em] text-background/60">
                    {v.tagline}
                  </p>
                  <p className="mt-5 max-w-[var(--prose-medium)] text-sm leading-[1.9] text-background/80">
                    {v.description}
                  </p>

                  <div className="mt-8 grid grid-cols-1 gap-6 border-t border-background/20 pt-6 md:grid-cols-3">
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-background/60">
                        Pros
                      </p>
                      <ul className="mt-3 space-y-2 text-xs leading-[1.7] text-background/90">
                        {v.pros.map((p) => (
                          <li key={p} className="flex gap-2">
                            <span aria-hidden="true">+</span>
                            <span>{p}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-background/60">
                        Cons
                      </p>
                      <ul className="mt-3 space-y-2 text-xs leading-[1.7] text-background/70">
                        {v.cons.map((c) => (
                          <li key={c} className="flex gap-2">
                            <span aria-hidden="true">−</span>
                            <span>{c}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-[0.18em] text-background/60">
                        Reference
                      </p>
                      <p className="mt-3 text-xs leading-[1.7] text-background/90">
                        {v.reference}
                      </p>
                    </div>
                  </div>
                </div>
              </header>

              {/* Variant preview — full chrome */}
              <div className="mx-auto max-w-[var(--container-max)] border-x border-border bg-background">
                <Component />
              </div>
            </section>
          );
        })}
      </div>

      {/* Footer note */}
      <footer className="mx-auto max-w-[var(--container-max)] px-6 py-16 text-center">
        <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
          End of Demo
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          お好みの variant をお知らせください。本番 /spaces/[slug]
          への適用に進めます。
        </p>
      </footer>
    </div>
  );
}

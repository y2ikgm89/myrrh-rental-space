import type { ReactElement } from "react";
import Image from "next/image";
import { DEMO_SPACE, formatPrice } from "./_data";

/**
 * Variant C: Editorial Magazine 改良
 * - Kinfolk hairline pattern を更に磨き込み (drop-cap / 余白拡大 / serif italic)
 * - Sticky widget は本文と並走
 */
export function VariantCEditorialRefined(): ReactElement {
  const space = DEMO_SPACE;
  return (
    <div className="bg-background">
      {/* Breadcrumb 帯 */}
      <div className="border-b border-divider bg-surface py-3 text-center text-xs uppercase tracking-[0.18em] text-muted-foreground">
        ホーム / スペース一覧 /{" "}
        <span className="text-foreground">{space.name}</span>
      </div>

      {/* Hero: eyebrow + h1 + italic dek + hairline + meta + media */}
      <article className="mx-auto max-w-[var(--container-max)] px-6 pt-16 md:px-12 md:pt-20">
        <header className="mb-16 text-center">
          <p className="mb-6 text-[0.7rem] uppercase tracking-[0.24em] text-accent">
            — Space —
          </p>
          <h1 className="font-heading text-4xl font-light leading-[1.15] tracking-tight md:text-5xl">
            {space.name}
          </h1>
          <p className="mx-auto mt-6 max-w-[42ch] font-heading text-lg italic text-muted-foreground md:text-xl">
            “{space.descriptionLead}”
          </p>
          <hr
            aria-hidden="true"
            className="mx-auto mt-8 w-12 border-0 border-t border-accent"
          />
          <div className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs uppercase tracking-[0.18em] text-muted-foreground">
            <span>{space.location}</span>
            <span aria-hidden="true">·</span>
            <span>最大 {space.capacity} 名</span>
            <span aria-hidden="true">·</span>
            <span>{space.area}㎡</span>
          </div>
        </header>

        {/* Hero media */}
        <div className="relative mx-auto mb-16 aspect-[3/2] max-w-3xl overflow-hidden">
          <Image
            src={space.mainImage}
            alt={space.name}
            fill
            sizes="(min-width: 768px) 768px, 100vw"
            className="object-cover"
          />
        </div>

        {/* Body 2-col + sticky */}
        <div className="grid gap-16 lg:grid-cols-[1fr_280px]">
          <div className="space-y-16">
            {/* Description with drop-cap */}
            <section>
              <p className="font-heading text-base leading-[2] text-foreground first-letter:float-left first-letter:mr-2 first-letter:mt-1 first-letter:font-heading first-letter:text-6xl first-letter:font-light first-letter:leading-none first-letter:text-accent">
                {space.descriptionParagraphs[0]}
              </p>
              {space.descriptionParagraphs.slice(1).map((p) => (
                <p
                  key={p}
                  className="mt-6 text-base leading-[2] text-foreground"
                >
                  {p}
                </p>
              ))}
            </section>

            {/* Sub gallery (vertical editorial) */}
            <div className="space-y-6">
              {space.subImages.slice(0, 2).map((img) => (
                <figure key={img}>
                  <div className="relative aspect-[3/2] overflow-hidden">
                    <Image
                      src={img}
                      alt={`${space.name} の写真`}
                      fill
                      sizes="(min-width: 1024px) 60vw, 100vw"
                      className="object-cover"
                    />
                  </div>
                  <figcaption className="mt-2 text-center text-xs uppercase tracking-[0.18em] text-muted-foreground">
                    — Figure —
                  </figcaption>
                </figure>
              ))}
            </div>

            {/* Amenities — editorial list */}
            <section className="border-y border-divider py-12">
              <p className="mb-6 text-center text-[0.7rem] uppercase tracking-[0.24em] text-accent">
                — Amenities —
              </p>
              <ul className="mx-auto grid max-w-md grid-cols-2 gap-y-3 text-center font-heading text-base font-light">
                {space.facilities.map((f) => (
                  <li key={f.name}>{f.name}</li>
                ))}
              </ul>
            </section>

            {/* Access */}
            <section>
              <p className="mb-4 text-[0.7rem] uppercase tracking-[0.24em] text-accent">
                — Access —
              </p>
              <h2 className="mb-6 font-heading text-2xl font-light">
                アクセス
              </h2>
              <ol className="space-y-3 font-heading text-base font-light leading-relaxed">
                {space.accessLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ol>
              <p className="mt-6 text-sm italic text-muted-foreground">
                — {space.parkingInfo}
              </p>
            </section>

            {/* Pull quote review */}
            <section className="border-y border-divider py-12 text-center">
              <p className="mb-6 text-[0.7rem] uppercase tracking-[0.24em] text-accent">
                — Voices —
              </p>
              <blockquote className="mx-auto max-w-[40ch] font-heading text-2xl font-light italic leading-relaxed text-foreground">
                “{space.reviews.items[0]?.comment}”
              </blockquote>
              <cite className="mt-4 block text-xs uppercase tracking-[0.18em] not-italic text-muted-foreground">
                — {space.reviews.items[0]?.authorName}
              </cite>
            </section>
          </div>

          {/* Sticky widget — editorial 風控えめ */}
          <aside className="lg:sticky lg:top-6 lg:self-start">
            <div className="border-y border-accent py-6 text-center">
              <p className="mb-2 text-[0.65rem] uppercase tracking-[0.24em] text-muted-foreground">
                — Reservation —
              </p>
              <p className="font-heading text-3xl font-light text-foreground">
                {formatPrice(space.hourlyPrice)}
                <span className="ml-1 text-xs text-muted-foreground">/h</span>
              </p>
              <p className="mt-1 font-heading text-base font-light italic text-muted-foreground">
                / {formatPrice(space.dailyPrice)} per day
              </p>
              <button
                type="button"
                className="mt-6 inline-flex min-h-12 w-full items-center justify-center border border-foreground px-7 py-3 text-xs uppercase tracking-[0.18em] text-foreground transition-colors hover:bg-foreground hover:text-background"
              >
                Reserve this space
              </button>
              <button
                type="button"
                className="mt-2 inline-flex min-h-11 w-full items-center justify-center px-5 py-2 text-xs uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
              >
                Inquiry
              </button>
            </div>
          </aside>
        </div>
      </article>
    </div>
  );
}

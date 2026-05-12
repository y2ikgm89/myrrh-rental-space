import type { ReactElement } from "react";
import { cn } from "@/shared/lib/cn";
import type { PageHeroConfig } from "@/shared/lib/sections/definitions/page-hero";
import { PortableTextSpans } from "@/shared/components/portable-text/PortableTextSpans";
import { PortableText } from "@/shared/components/portable-text/PortableText";

export type MinimalHeroProps = Omit<
  Extract<PageHeroConfig, { variant: "minimal" }>,
  "variant" | "layout"
>;

/**
 * ミニマルヒーロー — 画像なし、見出しとリードのみ
 */
export function MinimalHero({
  eyebrow,
  title,
  description,
}: MinimalHeroProps): ReactElement {
  return (
    <section
      data-hero=""
      className={cn(
        "bg-background",
        "ps-[var(--container-padding-start)] pe-[var(--container-padding-end)]",
        "py-[var(--space-lg)]",
      )}
    >
      {eyebrow ? (
        <p className="text-[0.75rem] uppercase tracking-[0.18em] text-muted-foreground">
          {eyebrow}
        </p>
      ) : null}
      <h1 className="mt-4 font-heading text-[clamp(2.25rem,6vw,3.5rem)] font-light tracking-tight">
        <PortableTextSpans spans={title} />
      </h1>
      {description.length > 0 && (
        <div className="mt-6 max-w-[40rem] text-base leading-relaxed text-muted-foreground [&_p]:mt-0 [&_p+p]:mt-3">
          <PortableText blocks={description} />
        </div>
      )}
    </section>
  );
}

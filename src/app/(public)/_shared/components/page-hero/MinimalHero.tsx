import type { ReactElement } from "react";
import { cn } from "@/shared/lib/cn";
import type { PageHero } from "@/shared/lib/sections/page-hero/schema";

export type MinimalHeroProps = Omit<
  Extract<PageHero, { variant: "minimal" }>,
  "variant"
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
        {title}
      </h1>
      <p className="mt-6 max-w-[40rem] text-base leading-relaxed text-muted-foreground">
        {description}
      </p>
    </section>
  );
}

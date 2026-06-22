import type { ReactElement } from "react";
import Image from "next/image";
import { Button } from "@/public/components/design-system/button";
import { cn } from "@/shared/lib/cn";
import { isAppRoute } from "@/shared/lib/typed-routes";
import type { PageHeroConfig } from "@/shared/lib/sections/definitions/page-hero";
import { PortableTextSpans } from "@/shared/components/portable-text/PortableTextSpans";
import { PortableText } from "@/shared/components/portable-text/PortableText";

export type CompactHeroProps = Omit<
  Extract<PageHeroConfig, { variant: "compact" }>,
  "variant"
>;

/**
 * コンパクトヒーロー — 画像 + テキスト帯（モバイルは 40svh 画像基準）
 */
export function CompactHero({
  image,
  label,
  title,
  description,
  buttons,
}: CompactHeroProps): ReactElement {
  return (
    <section
      data-hero=""
      className="grid grid-cols-1 md:grid-cols-2 md:min-h-[var(--hero-min-height-sm)]"
    >
      <div
        className={cn(
          "relative min-h-[var(--hero-min-height-sm)] w-full overflow-hidden bg-card",
          "md:min-h-0",
        )}
      >
        <Image
          src={image.url}
          alt={image.alt}
          fill
          className="object-cover"
          sizes="(max-width: 768px) 100vw, 50vw"
          priority
        />
      </div>
      <div
        className={cn(
          "flex flex-col justify-center bg-background",
          "ps-[var(--container-padding-start)] pe-[var(--container-padding-end)]",
          "py-[var(--spacing-fluid-md)]",
        )}
      >
        <p className="text-eyebrow-lg uppercase text-muted-foreground">
          <PortableTextSpans spans={label} />
        </p>
        <h1 className="mt-4 font-heading text-[clamp(2rem,5vw,3rem)] font-light tracking-tight">
          <PortableTextSpans spans={title} />
        </h1>
        <div className="mt-4 max-w-[28rem] text-sm leading-relaxed text-muted-foreground md:text-base [&_p]:mt-0 [&_p+p]:mt-3">
          <PortableText blocks={description} />
        </div>
        {buttons.length > 0 && (
          <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row sm:items-start sm:gap-4">
            {buttons.map((btn) => (
              <Button
                key={btn.url}
                variant="editorial"
                href={isAppRoute(btn.url) ? btn.url : "/reservation"}
                className="inline-flex min-h-[var(--touch-target-min)] items-center justify-center text-xs uppercase tracking-eyebrow"
                {...(btn.openInNewTab && { target: "_blank" as const })}
                label={btn.label}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

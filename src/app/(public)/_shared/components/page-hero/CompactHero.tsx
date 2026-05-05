import type { ReactElement } from "react";
import Image from "next/image";
import { cn } from "@/shared/lib/cn";
import type { PageHeroConfig } from "@/shared/lib/sections/definitions/page-hero";

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
          "py-[var(--space-md)]",
        )}
      >
        <p className="text-[0.75rem] uppercase tracking-[0.18em] text-muted-foreground">
          {label}
        </p>
        <h1 className="mt-4 font-heading text-[clamp(2rem,5vw,3rem)] font-light tracking-tight">
          {title}
        </h1>
        <p className="mt-4 max-w-[28rem] text-sm leading-relaxed text-muted-foreground md:text-base">
          {description}
        </p>
      </div>
    </section>
  );
}

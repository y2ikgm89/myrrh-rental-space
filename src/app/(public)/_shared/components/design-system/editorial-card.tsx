import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/shared/lib/cn";

type EditorialCardVariant = "default" | "featured";

interface EditorialCardProps {
  readonly title: string;
  readonly description?: string;
  readonly image?: {
    readonly src: string;
    readonly alt: string;
  };
  readonly meta?: ReactNode;
  readonly href: string;
  readonly variant?: EditorialCardVariant;
  readonly className?: string;
}

export function EditorialCard({
  title,
  description,
  image,
  meta,
  href,
  variant = "default",
  className,
}: EditorialCardProps) {
  if (variant === "featured") {
    return (
      <Link
        href={href}
        className={cn(
          "group grid grid-cols-1 gap-6 md:grid-cols-[5fr_4fr] md:gap-10",
          className,
        )}
      >
        {image ? (
          <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-surface">
            <Image
              src={image.src}
              alt={image.alt}
              fill
              sizes="(max-width: 768px) 100vw, 55vw"
              className="object-cover transition-transform duration-500 group-hover:scale-105"
            />
          </div>
        ) : null}
        <div className="flex flex-col justify-center gap-3">
          {meta ? (
            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              {meta}
            </div>
          ) : null}
          <h3 className="font-heading text-h3 font-light transition-colors group-hover:text-foreground">
            {title}
          </h3>
          {description ? (
            <p className="line-clamp-3 leading-relaxed text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className={cn(
        "group flex flex-col overflow-hidden rounded-lg border border-border bg-card transition-shadow duration-300 hover:shadow-lg",
        className,
      )}
    >
      {image ? (
        <div className="relative aspect-[4/3] overflow-hidden bg-surface">
          <Image
            src={image.src}
            alt={image.alt}
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover transition-transform duration-500 group-hover:scale-105"
          />
        </div>
      ) : null}
      <div className="flex flex-1 flex-col gap-2 p-4 sm:p-5">
        {meta ? (
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            {meta}
          </div>
        ) : null}
        <h3 className="font-heading text-h4 font-light">{title}</h3>
        {description ? (
          <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
    </Link>
  );
}

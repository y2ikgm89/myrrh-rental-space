import Image from "next/image";
import Link from "next/link";
import { Users, Ruler } from "lucide-react";
import { Badge } from "@/public/components/design-system/badge";

interface SpaceCardProps {
  readonly slug: string;
  readonly name: string;
  readonly description: string | null;
  readonly capacity: number | null;
  readonly area: number | null;
  readonly hourlyPrice: number | null;
  readonly mainImageUrl: string;
  readonly categoryName?: string | null | undefined;
}

export function SpaceCard({
  slug,
  name,
  description,
  capacity,
  area,
  hourlyPrice,
  mainImageUrl,
  categoryName,
}: SpaceCardProps) {
  return (
    <Link
      href={`/spaces/${slug}`}
      className="group block overflow-hidden rounded-lg border border-border bg-card transition-shadow duration-300 hover:shadow-lg"
    >
      {/* Image */}
      <div className="relative aspect-[4/3] overflow-hidden">
        <Image
          src={mainImageUrl}
          alt={name}
          fill
          sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
          className="object-cover transition-transform duration-500 group-hover:scale-105"
        />
        {categoryName ? (
          <div className="absolute left-3 top-3">
            <Badge>{categoryName}</Badge>
          </div>
        ) : null}
      </div>

      {/* Content */}
      <div className="p-4 md:p-5">
        <h3 className="font-heading text-base font-medium tracking-tight md:text-lg">
          {name}
        </h3>
        {description ? (
          <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
            {description}
          </p>
        ) : null}
        {capacity != null || hourlyPrice != null ? (
          <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-sm text-muted-foreground">
            <div className="flex items-center gap-3">
              {capacity != null ? (
                <span className="flex items-center gap-1">
                  <Users className="h-4 w-4" />
                  {capacity}名
                </span>
              ) : null}
              {area != null ? (
                <span className="flex items-center gap-1">
                  <Ruler className="h-4 w-4" />
                  {area}㎡
                </span>
              ) : null}
            </div>
            {hourlyPrice != null ? (
              <span className="font-medium text-primary-dark">
                &yen;{hourlyPrice.toLocaleString()}/h
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </Link>
  );
}

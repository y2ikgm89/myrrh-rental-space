"use client";

import { useRef, type ReactElement } from "react";
import Image from "next/image";
import Link from "next/link";
import { useGSAP } from "@gsap/react";
import { gsap } from "@/public/lib/gsap-config";
import { DURATION, EASE, STAGGER } from "@/public/lib/animations";

interface SpaceCardData {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly description: string | null;
  readonly capacity: number | null;
  readonly hourlyPrice: number | null;
  readonly area: number | null;
  readonly mainImageUrl: string;
}

interface SpaceGridProps {
  readonly spaces: readonly SpaceCardData[];
}

export function SpaceGrid({ spaces }: SpaceGridProps): ReactElement {
  const gridRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const grid = gridRef.current;
      if (!grid) return;

      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const cards = grid.querySelectorAll("[data-space-card]");
        if (cards.length === 0) return;

        gsap.fromTo(
          cards,
          { y: 40, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: DURATION.slow,
            ease: EASE.outQuart,
            stagger: STAGGER.card,
            scrollTrigger: {
              trigger: grid,
              start: "top 80%",
              toggleActions: "play none none none",
            },
          },
        );
      });
    },
    { scope: gridRef },
  );

  if (spaces.length === 0) {
    return (
      <p className="py-16 text-center text-muted-foreground">
        現在公開中のスペースはありません。
      </p>
    );
  }

  return (
    <div
      ref={gridRef}
      className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 md:gap-8"
    >
      {spaces.map((space) => (
        <Link
          key={space.id}
          href={`/spaces/${space.slug}`}
          data-space-card=""
          className="group overflow-hidden rounded-lg border border-border bg-card transition-shadow duration-300 hover:shadow-lg"
        >
          <div className="aspect-[4/3] overflow-hidden">
            <Image
              src={space.mainImageUrl}
              alt={space.name}
              width={400}
              height={300}
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              sizes="(max-width: 768px) 100vw, (max-width: 1024px) 50vw, 33vw"
            />
          </div>
          <div className="p-4 md:p-5">
            <h3 className="font-heading text-base font-medium tracking-tight md:text-lg">
              {space.name}
            </h3>
            {space.description && (
              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                {space.description}
              </p>
            )}
            {(space.capacity != null || space.hourlyPrice != null) && (
              <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                <span className="text-xs text-muted-foreground">
                  {space.capacity != null && `${space.capacity}名`}
                  {space.capacity != null && space.area != null && " / "}
                  {space.area != null && <>{space.area}m&sup2;</>}
                </span>
                {space.hourlyPrice != null && (
                  <span className="text-sm font-medium text-primary-dark">
                    &yen;{space.hourlyPrice.toLocaleString()}/h
                  </span>
                )}
              </div>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}

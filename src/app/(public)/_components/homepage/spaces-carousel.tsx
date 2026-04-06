"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { cn } from "@/shared/lib/cn";
import type { ShowcaseSpace } from "./spaces-section";

interface SpacesCarouselProps {
  readonly spaces: readonly ShowcaseSpace[];
}

/**
 * Infinite-loop horizontal carousel using CSS scroll-snap.
 *
 * Layout: [clone-last] [real-0] [real-1] … [real-N] [clone-first]
 * When the user scrolls onto a clone, we instantly jump to the real slide.
 */
export function SpacesCarousel({ spaces }: SpacesCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const isJumpingRef = useRef(false);
  const count = spaces.length;

  // Build slides array: clone-last + real slides + clone-first
  const slides = buildSlides(spaces);

  // On mount, scroll to the first real slide (index 1) without animation
  useEffect(() => {
    const container = scrollRef.current;
    if (!container || count <= 1) return;
    const firstReal = container.children[1] as HTMLElement | undefined;
    if (firstReal) {
      container.scrollLeft = firstReal.offsetLeft;
    }
  }, [count]);

  // Detect when scrolling settles on a clone and jump to the real slide
  useEffect(() => {
    const container = scrollRef.current;
    if (!container || count <= 1) return;

    let timer: ReturnType<typeof setTimeout>;

    const handleScroll = () => {
      clearTimeout(timer);
      if (isJumpingRef.current) return;

      timer = setTimeout(() => {
        const slideWidth = container.scrollWidth / slides.length;
        const rawIndex = Math.round(container.scrollLeft / slideWidth);

        if (rawIndex <= 0) {
          // On clone-last → jump to real last
          isJumpingRef.current = true;
          const realLast = container.children[count] as HTMLElement | undefined;
          if (realLast) {
            container.style.scrollBehavior = "auto";
            container.scrollLeft = realLast.offsetLeft;
            container.style.scrollBehavior = "";
          }
          setActiveIndex(count - 1);
          requestAnimationFrame(() => {
            isJumpingRef.current = false;
          });
        } else if (rawIndex >= slides.length - 1) {
          // On clone-first → jump to real first
          isJumpingRef.current = true;
          const realFirst = container.children[1] as HTMLElement | undefined;
          if (realFirst) {
            container.style.scrollBehavior = "auto";
            container.scrollLeft = realFirst.offsetLeft;
            container.style.scrollBehavior = "";
          }
          setActiveIndex(0);
          requestAnimationFrame(() => {
            isJumpingRef.current = false;
          });
        } else {
          // On a real slide
          setActiveIndex(rawIndex - 1);
        }
      }, 60);
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      clearTimeout(timer);
      container.removeEventListener("scroll", handleScroll);
    };
  }, [count, slides.length]);

  const scrollToSlide = useCallback((realIndex: number) => {
    const container = scrollRef.current;
    if (!container) return;
    // +1 because index 0 in DOM is the clone-last
    const child = container.children[realIndex + 1] as HTMLElement | undefined;
    if (child) {
      child.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "start",
      });
    }
  }, []);

  const handlePrev = () => {
    if (count <= 1) return;
    const container = scrollRef.current;
    if (!container) return;

    if (activeIndex === 0) {
      // Scroll to clone-last (index 0 in DOM), then jump will handle the rest
      const cloneLast = container.children[0] as HTMLElement | undefined;
      if (cloneLast) {
        cloneLast.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: "start",
        });
      }
    } else {
      scrollToSlide(activeIndex - 1);
    }
  };

  const handleNext = () => {
    if (count <= 1) return;
    const container = scrollRef.current;
    if (!container) return;

    if (activeIndex === count - 1) {
      // Scroll to clone-first (last child in DOM), then jump will handle the rest
      const cloneFirst = container.children[slides.length - 1] as
        | HTMLElement
        | undefined;
      if (cloneFirst) {
        cloneFirst.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
          inline: "start",
        });
      }
    } else {
      scrollToSlide(activeIndex + 1);
    }
  };

  return (
    <div
      role="region"
      aria-label="厳選スペース"
      aria-roledescription="carousel"
      className="relative"
    >
      {/* Scroll container */}
      <div
        ref={scrollRef}
        className="flex snap-x snap-mandatory overflow-x-auto"
        style={{ scrollbarWidth: "none" }}
      >
        {slides.map((slide, i) => (
          <CarouselSlide
            key={slide.key}
            space={slide.space}
            index={slide.realIndex}
            total={count}
            isClone={slide.isClone}
            priority={i === 1}
          />
        ))}
      </div>

      {/* Navigation arrows */}
      {count > 1 && (
        <>
          <button
            type="button"
            aria-label="前のスペース"
            onClick={handlePrev}
            className="absolute left-3 top-1/2 z-10 -translate-y-1/2 border border-accent-foreground/20 bg-foreground/30 p-2 backdrop-blur-sm transition-colors duration-200 hover:bg-foreground/50 sm:left-5 md:left-8 md:p-3"
          >
            <IconChevronLeft
              className="h-4 w-4 text-accent-foreground md:h-5 md:w-5"
              aria-hidden="true"
            />
          </button>
          <button
            type="button"
            aria-label="次のスペース"
            onClick={handleNext}
            className="absolute right-3 top-1/2 z-10 -translate-y-1/2 border border-accent-foreground/20 bg-foreground/30 p-2 backdrop-blur-sm transition-colors duration-200 hover:bg-foreground/50 sm:right-5 md:right-8 md:p-3"
          >
            <IconChevronRight
              className="h-4 w-4 text-accent-foreground md:h-5 md:w-5"
              aria-hidden="true"
            />
          </button>
        </>
      )}

      {/* Dot indicators */}
      {count > 1 && (
        <div className="absolute bottom-4 left-1/2 z-10 flex -translate-x-1/2 gap-2 sm:bottom-6">
          {spaces.map((space, i) => (
            <button
              key={space.id}
              type="button"
              aria-label={`${space.name}へ移動`}
              onClick={() => scrollToSlide(i)}
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                i === activeIndex
                  ? "w-6 bg-accent-foreground"
                  : "w-1.5 bg-accent-foreground/40 hover:bg-accent-foreground/60",
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Slide component                                                           */
/* -------------------------------------------------------------------------- */

interface CarouselSlideProps {
  readonly space: ShowcaseSpace;
  readonly index: number;
  readonly total: number;
  readonly isClone: boolean;
  readonly priority: boolean;
}

function CarouselSlide({
  space,
  index,
  total,
  isClone,
  priority,
}: CarouselSlideProps) {
  const content = (
    <div className="relative aspect-[4/3] sm:aspect-[16/9] md:aspect-[2/1]">
      {space.mainImageUrl ? (
        <Image
          src={space.mainImageUrl}
          alt={isClone ? "" : space.name}
          fill
          className="object-cover transition-transform duration-700 group-hover:scale-[1.02]"
          sizes="100vw"
          priority={priority}
        />
      ) : (
        <div className="h-full w-full bg-card" />
      )}

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-foreground/70 via-foreground/20 to-transparent" />

      {/* Content overlay */}
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-6 p-6 sm:p-8 md:p-12">
        <div className="max-w-xl">
          {space.categoryName && (
            <span className="text-[0.625rem] uppercase tracking-[0.18em] text-accent-foreground/70">
              {space.categoryName}
            </span>
          )}
          <h3 className="mt-1 font-heading text-h3 font-light text-accent-foreground">
            {space.name}
          </h3>
          {space.description && (
            <p className="mt-2 line-clamp-2 text-[0.85rem] leading-relaxed text-accent-foreground/80">
              {space.description}
            </p>
          )}
          <div className="mt-3 flex items-baseline gap-4 text-[0.75rem] text-accent-foreground/60">
            {space.area != null && <span>{space.area}m²</span>}
            <span>Max {space.capacity}</span>
          </div>
        </div>

        <div className="flex-none text-right">
          <p className="font-heading text-[1.5rem] font-light text-accent-foreground md:text-[2rem]">
            ¥{space.hourlyPrice.toLocaleString()}
            <span className="ml-1 font-sans text-[0.7rem] text-accent-foreground/60">
              /h
            </span>
          </p>
        </div>
      </div>
    </div>
  );

  return (
    <Link
      href={`/spaces/${space.slug}`}
      className="group relative w-full flex-none snap-start"
      {...(isClone && { "aria-hidden": true, tabIndex: -1 })}
      {...(!isClone && {
        role: "group" as const,
        "aria-roledescription": "slide",
        "aria-label": `${index + 1} / ${total}: ${space.name}`,
      })}
    >
      {content}
    </Link>
  );
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

interface SlideEntry {
  key: string;
  space: ShowcaseSpace;
  realIndex: number;
  isClone: boolean;
}

function buildSlides(spaces: readonly ShowcaseSpace[]): SlideEntry[] {
  if (spaces.length <= 1) {
    const first = spaces[0];
    if (!first) return [];
    return [{ key: first.id, space: first, realIndex: 0, isClone: false }];
  }

  const last = spaces[spaces.length - 1];
  const first = spaces[0];
  if (!last || !first) return [];

  const result: SlideEntry[] = [
    {
      key: `clone-last-${last.id}`,
      space: last,
      realIndex: spaces.length - 1,
      isClone: true,
    },
  ];

  for (let i = 0; i < spaces.length; i++) {
    const space = spaces[i];
    if (!space) continue;
    result.push({ key: space.id, space, realIndex: i, isClone: false });
  }

  result.push({
    key: `clone-first-${first.id}`,
    space: first,
    realIndex: 0,
    isClone: true,
  });

  return result;
}

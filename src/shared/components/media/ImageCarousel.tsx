"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { cn } from "@/shared/lib/cn";

interface ImageCarouselProps {
  readonly images: readonly string[];
  readonly alt: string;
  readonly sizes: string;
}

type ImageCarouselPriorityProps =
  | {
      /** カルーセル最初の画像（mount 時に表示）のみに適用する LCP 最適化。 */
      readonly preload: true;
      readonly loading?: never;
      readonly fetchPriority?: never;
    }
  | {
      readonly preload?: false;
      readonly loading?: "lazy" | "eager";
      readonly fetchPriority?: "high" | "low" | "auto";
    };

/**
 * Card-level image carousel with hover navigation buttons.
 *
 * - Desktop: left/right buttons appear on hover
 * - Mobile: swipe (CSS scroll-snap) + dot indicators
 * - Link navigation is prevented when clicking nav buttons
 */
export function ImageCarousel({
  images,
  alt,
  sizes,
  ...priorityProps
}: ImageCarouselProps & ImageCarouselPriorityProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const touchStartXRef = useRef(0);
  const count = images.length;
  const shouldPreload = priorityProps.preload === true;
  const loading = shouldPreload ? undefined : priorityProps.loading;
  const fetchPriority = shouldPreload ? undefined : priorityProps.fetchPriority;

  const goTo = (index: number) => {
    setActiveIndex((index + count) % count);
  };

  const handlePrev = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    goTo(activeIndex - 1);
  };

  const handleNext = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    goTo(activeIndex + 1);
  };

  const handleDotClick = (e: React.MouseEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    setActiveIndex(index);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (touch) {
      touchStartXRef.current = touch.clientX;
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const touch = e.changedTouches[0];
    if (!touch) return;
    const diff = touchStartXRef.current - touch.clientX;
    const threshold = 50;
    if (Math.abs(diff) > threshold) {
      goTo(diff > 0 ? activeIndex + 1 : activeIndex - 1);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      goTo(activeIndex - 1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      goTo(activeIndex + 1);
    }
  };

  const currentImage = images[activeIndex];
  if (!currentImage) return null;

  return (
    <div
      className="group/carousel relative aspect-[3/2] overflow-hidden"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onKeyDown={handleKeyDown}
      tabIndex={0}
      role="group"
      aria-roledescription="carousel"
      aria-label={`${alt} - ${count}枚の画像`}
    >
      {/* Images — crossfade transition.
       *
       * next/image の native lazy loading は IntersectionObserver ベースだが、
       * 同一 viewport に絶対配置で重ねた sibling は全部「画面内」と判定され
       * 並列で fetch される。N 枚カードで N 並列 DL になり LCP/帯域を圧迫する。
       * 対策として active ± 1 のみ実マウントして並列 DL を 3 枚に抑える。
       * (DOM 構造は維持しつつ Image を placeholder div に差し替える)
       */}
      {images.map((src, i) => {
        const isWindow =
          i === activeIndex ||
          i === (activeIndex - 1 + count) % count ||
          i === (activeIndex + 1) % count;
        const imagePriorityProps =
          shouldPreload && i === 0
            ? { preload: true }
            : {
                ...(loading !== undefined && {
                  loading: i === 0 ? loading : "lazy",
                }),
                ...(fetchPriority !== undefined && {
                  fetchPriority: i === 0 ? fetchPriority : "auto",
                }),
              };
        return (
          <div
            key={src}
            className={cn(
              "absolute inset-0 transition-opacity duration-400",
              i === activeIndex ? "opacity-100" : "opacity-0",
            )}
            aria-hidden={i !== activeIndex}
          >
            {isWindow ? (
              <Image
                src={src}
                alt={i === activeIndex ? `${alt} ${i + 1}/${count}` : ""}
                fill
                sizes={sizes}
                {...imagePriorityProps}
                className="object-cover"
              />
            ) : null}
          </div>
        );
      })}

      {/* Navigation buttons — visible on hover (desktop only) */}
      {count > 1 && (
        <>
          <button
            type="button"
            aria-label="前の画像"
            onClick={handlePrev}
            className={cn(
              "absolute left-2 top-1/2 z-10 -translate-y-1/2",
              "hidden h-11 w-11 items-center justify-center md:flex",
              "bg-background/80 backdrop-blur-sm",
              "border border-border/50",
              "opacity-0 transition-opacity duration-200",
              "group-hover/carousel:opacity-100",
              "hover:bg-background",
              "focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            )}
          >
            <IconChevronLeft
              className="h-4 w-4 text-foreground"
              aria-hidden="true"
            />
          </button>
          <button
            type="button"
            aria-label="次の画像"
            onClick={handleNext}
            className={cn(
              "absolute right-2 top-1/2 z-10 -translate-y-1/2",
              "hidden h-11 w-11 items-center justify-center md:flex",
              "bg-background/80 backdrop-blur-sm",
              "border border-border/50",
              "opacity-0 transition-opacity duration-200",
              "group-hover/carousel:opacity-100",
              "hover:bg-background",
              "focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            )}
          >
            <IconChevronRight
              className="h-4 w-4 text-foreground"
              aria-hidden="true"
            />
          </button>
        </>
      )}

      {/* Dot indicators */}
      {count > 1 && (
        <div
          className="absolute bottom-2 left-1/2 z-10 flex -translate-x-1/2 gap-1.5"
          aria-label="画像選択"
        >
          {images.map((src, i) => (
            <button
              key={src}
              type="button"
              aria-label={`画像 ${i + 1} 枚目を表示`}
              aria-current={i === activeIndex ? "true" : undefined}
              onClick={(e) => handleDotClick(e, i)}
              className="inline-flex min-h-11 min-w-11 items-center justify-center"
            >
              <span
                aria-hidden="true"
                className={cn(
                  "block h-1.5 rounded-full transition-all duration-300",
                  i === activeIndex
                    ? "w-4 bg-background"
                    : "w-1.5 bg-background/60 hover:bg-background/80",
                )}
              />
            </button>
          ))}
        </div>
      )}

      {/* Image counter (top right) */}
      {count > 1 && (
        <span
          className={cn(
            "absolute right-2 top-2 z-10",
            "bg-foreground/50 px-2 py-0.5 text-[0.625rem] text-background backdrop-blur-sm",
            "opacity-0 transition-opacity duration-200",
            "group-hover/carousel:opacity-100",
          )}
          aria-hidden="true"
        >
          {activeIndex + 1}/{count}
        </span>
      )}
    </div>
  );
}

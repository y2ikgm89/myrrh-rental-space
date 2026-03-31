"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { IconChevronLeft, IconChevronRight, IconX } from "@tabler/icons-react";
import { cn } from "@/shared/lib/cn";
import { AnnouncementBarDesignStyle } from "@/shared/db/enums";
import { useCarousel } from "./use-carousel";
import { useDismissedBars, dismissBar } from "./use-dismissed-bars";
import { computeBarStyles, getTransitionAnimation } from "./styles";
import type { AnnouncementBarItem, CarouselSettings } from "./types";

function isWithinDisplayPeriod(bar: AnnouncementBarItem): boolean {
  const now = new Date();
  const startAt = bar.startAt ? new Date(bar.startAt) : null;
  const endAt = bar.endAt ? new Date(bar.endAt) : null;
  if (!startAt && !endAt) return true;
  if (startAt && !endAt) return now >= startAt;
  if (!startAt && endAt) return now <= endAt;
  return startAt !== null && endAt !== null && now >= startAt && now <= endAt;
}

interface AnnouncementBarProps {
  readonly bars: AnnouncementBarItem[];
  readonly settings: CarouselSettings;
}

export function AnnouncementBar({ bars, settings }: AnnouncementBarProps) {
  const [isPaused, setIsPaused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const dismissedIds = useDismissedBars();

  const visibleBars = bars.filter(
    (bar) => !dismissedIds.includes(bar.id) && isWithinDisplayPeriod(bar),
  );

  const {
    currentIndex,
    currentBar,
    isTransitioning,
    onAnimationEnd,
    goNext,
    goPrev,
    total,
  } = useCarousel({
    bars: visibleBars,
    autoPlay: settings.autoPlay,
    duration: settings.duration,
    isPaused,
  });

  // Sticky: publish height as CSS custom property
  useEffect(() => {
    if (!settings.sticky) return;
    const el = containerRef.current;
    if (!el) return;

    if (visibleBars.length === 0) {
      document.documentElement.style.setProperty(
        "--announcement-bar-height",
        "0px",
      );
      return;
    }

    const update = () => {
      document.documentElement.style.setProperty(
        "--announcement-bar-height",
        `${el.getBoundingClientRect().height}px`,
      );
    };
    const ro = new ResizeObserver(update);
    ro.observe(el);
    update();

    return () => {
      ro.disconnect();
      document.documentElement.style.setProperty(
        "--announcement-bar-height",
        "0px",
      );
    };
  }, [settings.sticky, visibleBars.length]);

  if (visibleBars.length === 0 || !currentBar) return null;

  const { className, style, linkHoverClass, hasCustomText } = computeBarStyles(
    settings,
    currentBar,
  );
  const showNav = total > 1;

  return (
    <div
      ref={containerRef}
      className={className}
      style={style}
      role="region"
      aria-live="polite"
      aria-label="お知らせ"
      onMouseEnter={() => settings.pauseOnHover && setIsPaused(true)}
      onMouseLeave={() => settings.pauseOnHover && setIsPaused(false)}
    >
      {/* Glass shimmer overlay */}
      {settings.designStyle === AnnouncementBarDesignStyle.glass &&
        settings.glassAnimation && (
          <div
            className="pointer-events-none absolute inset-0 overflow-hidden"
            aria-hidden="true"
          >
            <div
              className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-card/20 to-transparent"
              style={{ animation: "glass-shimmer 3s ease-in-out infinite" }}
            />
          </div>
        )}

      {/* Prev arrow */}
      {settings.showArrows && showNav && (
        <button
          type="button"
          onClick={goPrev}
          className={cn(
            "absolute left-2 rounded-full p-1 transition-colors",
            !hasCustomText && "hover:bg-foreground/10",
          )}
          aria-label="前のお知らせ"
        >
          <IconChevronLeft className="h-4 w-4" />
        </button>
      )}

      {/* Content with CSS animation */}
      <div className="mx-8 flex min-h-[1.5rem] items-center justify-center gap-2 overflow-hidden">
        <div
          className="flex items-center gap-2"
          style={
            isTransitioning
              ? { animation: getTransitionAnimation(settings.animation) }
              : undefined
          }
          onAnimationEnd={onAnimationEnd}
        >
          <span className="text-center">{currentBar.message}</span>
          {currentBar.linkUrl && currentBar.linkText && (
            <Link
              href={currentBar.linkUrl}
              className={cn(
                "ml-1 whitespace-nowrap underline underline-offset-2 transition-colors",
                linkHoverClass,
              )}
              target={
                currentBar.linkUrl.startsWith("http") ? "_blank" : undefined
              }
              rel={
                currentBar.linkUrl.startsWith("http")
                  ? "noopener noreferrer"
                  : undefined
              }
            >
              {currentBar.linkText}
            </Link>
          )}
        </div>
      </div>

      {/* Indicator */}
      {settings.showIndicator && showNav && (
        <span className="absolute right-12 text-xs">
          {currentIndex + 1}/{total}
        </span>
      )}

      {/* Next arrow */}
      {settings.showArrows && showNav && (
        <button
          type="button"
          onClick={goNext}
          className={cn(
            "absolute right-6 rounded-full p-1 transition-colors",
            !hasCustomText && "hover:bg-foreground/10",
          )}
          aria-label="次のお知らせ"
        >
          <IconChevronRight className="h-4 w-4" />
        </button>
      )}

      {/* Dismiss */}
      <button
        type="button"
        onClick={() => dismissBar(currentBar.id)}
        className={cn(
          "absolute right-2 rounded-full p-1 transition-colors",
          !hasCustomText && "hover:bg-foreground/10",
        )}
        aria-label="閉じる"
      >
        <IconX className="h-4 w-4" />
      </button>
    </div>
  );
}

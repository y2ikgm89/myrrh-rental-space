"use client";

import type { ReactElement } from "react";
import { useRef, useState, useEffect, useEffectEvent } from "react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/public/components/design-system/button";
import {
  IconArrowRight,
  IconChevronLeft,
  IconChevronRight,
} from "@tabler/icons-react";
import { cn } from "@/shared/lib/cn";
import { useAriaLiveOptional } from "@/shared/contexts";
import { useFormatPrice } from "@/public/hooks/use-format-price";
import { toAppRoute } from "@/shared/lib/typed-routes";
import type { ShowcaseSpace } from "./spaces-section";

// Breakpoints matching Tailwind sm/lg
const SM = 640;
const LG = 1024;

const TRANSITION_MS = 500;
const REPEATS = 51;
const VISIBLE_COUNT = 5;
const SWIPE_THRESHOLD = 40;

interface CardDims {
  width: number;
  gap: number;
  sizes: string;
}

const DIMS_MOBILE: CardDims = { width: 260, gap: -50, sizes: "260px" };
const DIMS_TABLET: CardDims = { width: 380, gap: -130, sizes: "380px" };
const DIMS_DESKTOP: CardDims = { width: 500, gap: -220, sizes: "500px" };

function getDims(vw: number): CardDims {
  if (vw < SM) return DIMS_MOBILE;
  if (vw < LG) return DIMS_TABLET;
  return DIMS_DESKTOP;
}

function getCardStyle(distance: number) {
  if (distance === 0) return { zIndex: 30, scale: 1, opacity: 1 };
  if (distance === 1) return { zIndex: 20, scale: 0.9, opacity: 0.7 };
  if (distance === 2) return { zIndex: 10, scale: 0.82, opacity: 0.4 };
  return { zIndex: 5, scale: 0.75, opacity: 0.2 };
}

/** Minimum auto-play interval in seconds (prevents disorienting speed). */
const MIN_INTERVAL_S = 3;

interface SpacesCarouselProps {
  readonly spaces: readonly ShowcaseSpace[];
  /** Auto-play interval in seconds. 0 disables auto-play. */
  readonly autoPlayInterval: number;
}

export function SpacesCarousel({
  spaces,
  autoPlayInterval,
}: SpacesCarouselProps): ReactElement {
  const count = spaces.length;
  const safeCount = Math.max(count, 1);
  const totalCards = safeCount * REPEATS;
  const centerStart = Math.floor(REPEATS / 2) * safeCount;
  const isTransitioningRef = useRef(false);
  const carouselRef = useRef<HTMLDivElement>(null);
  const touchRef = useRef({
    startX: 0,
    startY: 0,
    delta: 0,
    isHorizontal: false,
  });

  const { formatUnit } = useFormatPrice();

  // --- Responsive dimensions (SSR-safe: mobile as default) ---
  const [dims, setDims] = useState<CardDims>(DIMS_MOBILE);

  useEffect(() => {
    let rafId: number;
    const update = () => setDims(getDims(window.innerWidth));
    // Schedule initial measurement after mount (avoids sync setState in effect)
    rafId = requestAnimationFrame(update);
    const handleResize = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(update);
    };
    window.addEventListener("resize", handleResize, { passive: true });
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", handleResize);
    };
  }, []);

  const cardWidth = dims.width;
  const cardStep = dims.width + dims.gap;
  // aspect 3/2 → height multiplier = 2/3
  const trackHeight = cardWidth * (2 / 3) + 20;

  // --- Navigation state ---
  const [scrollIndex, setScrollIndex] = useState(centerStart);
  const activeIndex = ((scrollIndex % safeCount) + safeCount) % safeCount;
  const activeSpace = spaces[activeIndex];

  // --- Auto-play pause management ---
  const pausedByUserRef = useRef(false);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const isHoveredRef = useRef(false);
  const isFocusedRef = useRef(false);

  /** Pause auto-play temporarily after user interaction, resume after 8s. */
  const pauseForInteraction = () => {
    pausedByUserRef.current = true;
    clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(() => {
      pausedByUserRef.current = false;
    }, 8_000);
  };

  const navigate = (direction: 1 | -1) => {
    if (isTransitioningRef.current) return;
    isTransitioningRef.current = true;
    pauseForInteraction();
    setScrollIndex((prev) => prev + direction);
    setTimeout(() => {
      isTransitioningRef.current = false;
    }, TRANSITION_MS);
  };

  const jumpTo = (i: number) => {
    if (isTransitioningRef.current || i === scrollIndex) return;
    isTransitioningRef.current = true;
    pauseForInteraction();
    setScrollIndex(i);
    setTimeout(() => {
      isTransitioningRef.current = false;
    }, TRANSITION_MS);
  };

  const jumpToDot = (targetReal: number) => {
    if (isTransitioningRef.current) return;
    const diff = targetReal - activeIndex;
    if (diff === 0) return;
    let step = diff;
    if (Math.abs(diff) > safeCount / 2) {
      step = diff > 0 ? diff - safeCount : diff + safeCount;
    }
    isTransitioningRef.current = true;
    pauseForInteraction();
    setScrollIndex((prev) => prev + step);
    setTimeout(() => {
      isTransitioningRef.current = false;
    }, TRANSITION_MS);
  };

  // Scoped keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      navigate(-1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      navigate(1);
    }
  };

  // Touch swipe — useEffectEvent wraps navigate to keep deps clean
  const onSwipe = useEffectEvent((direction: 1 | -1) => {
    navigate(direction);
  });

  // Non-passive touch handler for proper preventDefault
  useEffect(() => {
    const el = carouselRef.current;
    if (!el) return;

    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;
      touchRef.current = {
        startX: touch.clientX,
        startY: touch.clientY,
        delta: 0,
        isHorizontal: false,
      };
    };

    const handleTouchMove = (e: TouchEvent) => {
      const touch = e.touches[0];
      if (!touch) return;
      const t = touchRef.current;
      const dx = touch.clientX - t.startX;
      const dy = touch.clientY - t.startY;

      if (!t.isHorizontal && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
        t.isHorizontal = Math.abs(dx) > Math.abs(dy);
      }

      if (t.isHorizontal) {
        e.preventDefault();
        t.delta = dx;
      }
    };

    const handleTouchEnd = () => {
      const t = touchRef.current;
      if (!t.isHorizontal) return;
      if (t.delta > SWIPE_THRESHOLD) {
        onSwipe(-1);
      } else if (t.delta < -SWIPE_THRESHOLD) {
        onSwipe(1);
      }
      t.delta = 0;
    };

    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchmove", handleTouchMove, { passive: false });
    el.addEventListener("touchend", handleTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
    };
  }, []);

  // Aria-live announcement on slide change
  const ariaLive = useAriaLiveOptional();
  useEffect(() => {
    if (activeSpace && ariaLive) {
      ariaLive.announce(activeSpace.name, "polite");
    }
  }, [activeIndex, activeSpace, ariaLive]);

  // Prefers reduced motion
  const [reduceMotion, setReduceMotion] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handler = (e: MediaQueryListEvent) => setReduceMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const transitionClass = reduceMotion
    ? ""
    : "transition-all duration-500 ease-[cubic-bezier(0.25,0.1,0.25,1)]";

  // --- Auto-play timer ---
  const intervalMs =
    autoPlayInterval >= MIN_INTERVAL_S ? autoPlayInterval * 1000 : 0;
  const autoPlayEnabled = intervalMs > 0 && count > 1 && !reduceMotion;

  // useEffectEvent: read latest refs without adding them to deps
  const onAutoPlayTick = useEffectEvent(() => {
    if (
      isTransitioningRef.current ||
      pausedByUserRef.current ||
      isHoveredRef.current ||
      isFocusedRef.current
    )
      return;
    setScrollIndex((prev) => prev + 1);
    isTransitioningRef.current = true;
    setTimeout(() => {
      isTransitioningRef.current = false;
    }, TRANSITION_MS);
  });

  useEffect(() => {
    if (!autoPlayEnabled) return;

    // Pause when tab is hidden
    let timer: ReturnType<typeof setInterval> | undefined;
    const start = () => {
      clearInterval(timer);
      timer = setInterval(onAutoPlayTick, intervalMs);
    };
    const stop = () => clearInterval(timer);

    const handleVisibility = () => {
      if (document.hidden) {
        stop();
      } else {
        start();
      }
    };

    start();
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [autoPlayEnabled, intervalMs]);

  // Cleanup resume timer on unmount
  useEffect(() => {
    return () => clearTimeout(resumeTimerRef.current);
  }, []);

  // --- Hover/Focus pause for auto-play ---
  const handlePointerEnter = () => {
    isHoveredRef.current = true;
  };
  const handlePointerLeave = () => {
    isHoveredRef.current = false;
  };
  const handleFocusIn = () => {
    isFocusedRef.current = true;
  };
  const handleFocusOut = () => {
    isFocusedRef.current = false;
  };

  // Empty spaces guard — after all hooks
  if (count === 0) {
    return <div />;
  }

  // --- Visible cards (only render ±VISIBLE_COUNT) ---
  const visibleCards: Array<{ i: number; offset: number; distance: number }> =
    [];
  for (let d = -VISIBLE_COUNT; d <= VISIBLE_COUNT; d++) {
    const i = scrollIndex + d;
    if (i >= 0 && i < totalCards) {
      visibleCards.push({ i, offset: d, distance: Math.abs(d) });
    }
  }

  return (
    <div
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      onFocusCapture={handleFocusIn}
      onBlurCapture={handleFocusOut}
    >
      {/* Carousel viewport — focusable for scoped keyboard nav */}
      <div
        ref={carouselRef}
        className="relative overflow-hidden px-5 outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 md:px-10"
        role="region"
        aria-label="厳選スペース"
        aria-roledescription="carousel"
        aria-live={autoPlayEnabled ? "off" : "polite"}
        tabIndex={0}
        onKeyDown={handleKeyDown}
      >
        {/* Track */}
        <div
          className="relative flex items-center justify-center"
          style={{ height: `${trackHeight}px` }}
        >
          {visibleCards.map(({ i, offset, distance }) => {
            const realIdx = i % count;
            const space = spaces[realIdx];
            if (!space) return null;

            const { zIndex, scale, opacity } = getCardStyle(distance);
            const isActive = distance === 0;
            const translateX = offset * cardStep;

            return (
              <div
                key={`card-${i}`}
                className={cn("absolute", transitionClass)}
                style={{
                  width: `${cardWidth}px`,
                  zIndex,
                  transform: `translateX(${translateX}px) scale(${scale})`,
                  opacity,
                }}
              >
                <button
                  type="button"
                  onClick={() => jumpTo(i)}
                  className="group block w-full text-left"
                  aria-label={`${space.name}を表示`}
                >
                  <div className="relative aspect-[3/2] overflow-hidden">
                    {distance <= VISIBLE_COUNT && space.mainImageUrl ? (
                      <Image
                        src={space.mainImageUrl}
                        alt={isActive ? space.name : ""}
                        fill
                        className={cn(
                          "object-cover",
                          !reduceMotion && "transition-transform duration-700",
                          isActive &&
                            !reduceMotion &&
                            "group-hover:scale-[1.08]",
                        )}
                        sizes={dims.sizes}
                      />
                    ) : (
                      <div className="h-full w-full bg-card" />
                    )}

                    {/* Hover overlay — desktop only */}
                    {isActive && (
                      <div
                        className={cn(
                          "pointer-events-none absolute inset-0 hidden flex-col justify-end bg-foreground/70 p-4 opacity-0 md:flex md:p-5",
                          !reduceMotion &&
                            "transition-opacity duration-700 group-hover:opacity-100",
                        )}
                      >
                        {space.categoryName && (
                          <span className="text-[0.6rem] uppercase tracking-[0.18em] text-accent-foreground/70">
                            {space.categoryName}
                          </span>
                        )}
                        <p className="mt-1 font-heading text-h3 font-light text-accent-foreground">
                          {space.name}
                        </p>
                        <div className="mt-3 flex items-baseline gap-4 text-[0.8rem] text-accent-foreground/80">
                          {space.area != null && (
                            <span>広さ {space.area}m²</span>
                          )}
                          <span>定員 {space.capacity}名</span>
                        </div>
                        <p className="mt-2 text-base font-light text-accent-foreground">
                          {formatUnit(space.hourlyPrice, "/h")}
                        </p>
                      </div>
                    )}
                  </div>
                </button>
              </div>
            );
          })}
        </div>

        {/* Nav arrows — desktop only */}
        <button
          type="button"
          aria-label="前のスペース"
          onClick={() => navigate(-1)}
          className="absolute left-4 top-1/2 z-40 hidden -translate-y-1/2 border border-border bg-background/80 p-3 backdrop-blur-sm transition-colors duration-200 hover:border-foreground/30 md:flex lg:left-8"
        >
          <IconChevronLeft
            className="h-5 w-5 text-foreground"
            aria-hidden="true"
          />
        </button>
        <button
          type="button"
          aria-label="次のスペース"
          onClick={() => navigate(1)}
          className="absolute right-4 top-1/2 z-40 hidden -translate-y-1/2 border border-border bg-background/80 p-3 backdrop-blur-sm transition-colors duration-200 hover:border-foreground/30 md:flex lg:right-8"
        >
          <IconChevronRight
            className="h-5 w-5 text-foreground"
            aria-hidden="true"
          />
        </button>
      </div>

      {/* Detail panel */}
      {activeSpace && (
        <div className="mx-auto max-w-[var(--container-max)] px-[var(--container-padding)]">
          <div className="mx-auto mt-8 max-w-2xl text-center md:mt-14">
            {activeSpace.categoryName && (
              <span className="text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
                {activeSpace.categoryName}
              </span>
            )}
            <h3 className="mt-2 font-heading text-h3 font-light md:text-h2">
              {activeSpace.name}
            </h3>
            <div className="mt-3 flex items-baseline justify-center gap-4 text-base font-light md:gap-6 md:text-lg">
              <p>{formatUnit(activeSpace.hourlyPrice, "/h")}</p>
              {activeSpace.dailyPrice != null && (
                <p>{formatUnit(activeSpace.dailyPrice, "/day")}</p>
              )}
            </div>
            <div className="mt-2 flex items-center justify-center gap-4 text-sm text-muted-foreground md:gap-6">
              {activeSpace.area != null && (
                <span>広さ {activeSpace.area}m²</span>
              )}
              <span>定員 {activeSpace.capacity}名</span>
            </div>
            {activeSpace.descriptionPlainText && (
              <p className="mt-4 line-clamp-2 text-sm leading-relaxed text-muted-foreground md:text-base">
                {activeSpace.descriptionPlainText}
              </p>
            )}
            <div className="mt-5">
              <Button
                variant="editorial"
                href={toAppRoute(`/spaces/${activeSpace.slug}`)}
                className="text-xs uppercase tracking-[0.18em]"
              >
                View Details
              </Button>
            </div>
            <Link
              href="/spaces"
              className="mt-3 inline-flex items-center gap-1 px-3 py-1.5 text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground/70 transition-colors duration-300 hover:text-foreground"
            >
              すべてのスペースを見る
              <IconArrowRight className="h-3 w-3" aria-hidden="true" />
            </Link>
          </div>

          {/* Dot indicators */}
          <div className="mt-6 flex items-center justify-center gap-2">
            {spaces.map((space, i) => (
              <button
                key={space.id}
                type="button"
                aria-label={`${space.name}へ移動`}
                aria-current={i === activeIndex ? "true" : undefined}
                onClick={() => jumpToDot(i)}
                className="relative flex items-center justify-center py-3 md:py-2"
              >
                <span
                  className={cn(
                    "block h-2 rounded-full transition-all duration-300 md:h-1.5",
                    i === activeIndex
                      ? "w-8 bg-accent md:w-6"
                      : "w-2 bg-foreground/20 md:w-1.5",
                  )}
                />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

/**
 * SpacesCarousel — Center-stage overlapping card carousel
 *
 * Editorial homepage carousel with 3 layered z-index/scale/opacity per side.
 * 自動送りは GSAP 単一 tween で進捗バー（scaleX 0→1）を駆動し onComplete で前進する
 * （進捗の可視化と送りタイミングを完全同期、setInterval 不使用、タブ非表示は rAF 停止で自然に一時停止）。
 * 明示的な一時停止/再生ボタン + hover/focus 停止 + reduced-motion off で WCAG 2.2.2 を満たす。
 * スライドピッカーは APG grouped buttons（role="group" + 各 button + 現在スライド aria-disabled）。
 */

import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactElement,
} from "react";
import Image from "next/image";
import Link from "next/link";
import {
  IconArrowRight,
  IconChevronLeft,
  IconChevronRight,
  IconPlayerPauseFilled,
  IconPlayerPlayFilled,
} from "@tabler/icons-react";
import { Button } from "@/public/components/design-system/button";
import { SectionLabel } from "@/public/components/ui/SectionLabel";
import { Heading } from "@/public/components/design-system/heading";
import { ScrollReveal } from "@/public/components/animations/scroll-reveal";
import { SectionWrapper } from "@/public/components/sections/SectionWrapper";
import {
  getTitleClasses,
  getTitleStyle,
} from "@/public/components/sections/section-style-helpers";
import { useAriaLiveOptional } from "@/shared/contexts";
import { useFormatPrice } from "@/public/hooks/use-format-price";
import { gsap } from "@/public/lib/gsap-config";
import { EASE } from "@/public/lib/animations";
import { toAppRoute } from "@/shared/lib/typed-routes";
import { cn } from "@/shared/lib/cn";
import { getCardStyle, shortestStep, wrapIndex } from "./_carousel-math";
import type { ShowcaseSpaceData } from "../SpaceShowcaseSection";
import type { SpaceShowcaseConfig } from "@/shared/lib/validations/section";
import type { SectionStylePayload } from "@/shared/domain/section-styles/types";
import { PortableTextSpans } from "@/shared/components/portable-text/PortableTextSpans";
import { spansToPlainText } from "@/shared/lib/portable-text";

const SM = 640;
const LG = 1024;
const TRANSITION_MS = 500;
const REPEATS = 51;
const VISIBLE_COUNT = 5;
const SWIPE_THRESHOLD = 40;
const MIN_INTERVAL_S = 3;

interface CardDims {
  readonly width: number;
  readonly gap: number;
  readonly sizes: string;
}

const DIMS_MOBILE: CardDims = { width: 260, gap: -50, sizes: "260px" };
const DIMS_TABLET: CardDims = { width: 380, gap: -130, sizes: "380px" };
const DIMS_DESKTOP: CardDims = { width: 500, gap: -220, sizes: "500px" };

function pickDims(vw: number): CardDims {
  if (vw < SM) return DIMS_MOBILE;
  if (vw < LG) return DIMS_TABLET;
  return DIMS_DESKTOP;
}

// useSyncExternalStore subscribers for prefers-reduced-motion media query.
// Module-scope so React keeps a stable reference across renders.
function subscribeReduceMotion(callback: () => void): () => void {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}
function getReduceMotionSnapshot(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
function getReduceMotionServerSnapshot(): boolean {
  return false;
}

interface Props {
  readonly config: SpaceShowcaseConfig;
  readonly spaces: readonly ShowcaseSpaceData[];
  readonly style: SectionStylePayload;
}

export function SpacesCarousel({
  config,
  spaces,
  style,
}: Props): ReactElement | null {
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

  // SSR-safe mobile defaults; resize listener upgrades after mount.
  const [dims, setDims] = useState<CardDims>(DIMS_MOBILE);
  useEffect(() => {
    let rafId: number;
    const update = () => {
      setDims(pickDims(window.innerWidth));
    };
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
  const trackHeight = cardWidth * (2 / 3) + 20; // aspect 3/2 + breathing room

  const [scrollIndex, setScrollIndex] = useState(centerStart);
  const activeIndex = wrapIndex(scrollIndex, safeCount);
  const activeSpace = spaces[activeIndex];

  // 自動回転の再生状態（ユーザーの明示操作 / フォーカス侵入で false、再生は停止ボタンのみ）
  const [isPlaying, setIsPlaying] = useState(true);
  // ホバー中の一時停止（一過性 — 離れたら再開、isPlaying は変えない）
  const isHoveredRef = useRef(false);
  // 進捗バー fill 要素（GSAP が scaleX 0→1 で駆動）と駆動中の tween 参照
  const progressFillsRef = useRef<(HTMLSpanElement | null)[]>([]);
  const progressTweenRef = useRef<ReturnType<typeof gsap.to> | null>(null);

  // 自動送り（progress tween onComplete 経由）専用の前進。isPlaying は変えない。
  const advance = (direction: 1 | -1) => {
    if (isTransitioningRef.current) return;
    isTransitioningRef.current = true;
    setScrollIndex((prev) => prev + direction);
    setTimeout(() => {
      isTransitioningRef.current = false;
    }, TRANSITION_MS);
  };

  // ユーザー操作の前進（矢印 / キーボード）は自動回転を止める。
  const handlePrev = () => {
    setIsPlaying(false);
    advance(-1);
  };
  const handleNext = () => {
    setIsPlaying(false);
    advance(1);
  };

  const jumpTo = (i: number) => {
    setIsPlaying(false);
    if (isTransitioningRef.current || i === scrollIndex) return;
    isTransitioningRef.current = true;
    setScrollIndex(i);
    setTimeout(() => {
      isTransitioningRef.current = false;
    }, TRANSITION_MS);
  };

  const jumpToDot = (targetReal: number) => {
    setIsPlaying(false);
    if (isTransitioningRef.current) return;
    const step = shortestStep(activeIndex, targetReal, safeCount);
    if (step === 0) return;
    isTransitioningRef.current = true;
    setScrollIndex((prev) => prev + step);
    setTimeout(() => {
      isTransitioningRef.current = false;
    }, TRANSITION_MS);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      handlePrev();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      handleNext();
    }
  };

  const onSwipe = useEffectEvent((direction: 1 | -1) => {
    setIsPlaying(false);
    advance(direction);
  });

  // Touch swipe — non-passive so move can preventDefault during horizontal drag.
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

  // Aria-live announce on slide change
  const ariaLive = useAriaLiveOptional();
  const announceActive = useEffectEvent(() => {
    if (activeSpace && ariaLive) {
      ariaLive.announce(activeSpace.name, "polite");
    }
  });
  useEffect(() => {
    announceActive();
  }, [activeIndex]);

  // Reduced motion (useSyncExternalStore — React 19 official pattern for matchMedia)
  const reduceMotion = useSyncExternalStore(
    subscribeReduceMotion,
    getReduceMotionSnapshot,
    getReduceMotionServerSnapshot,
  );

  const transitionClass = reduceMotion
    ? ""
    : "transition-all duration-500 ease-[cubic-bezier(0.25,0.1,0.25,1)]";

  // 自動送りの間隔（config 駆動）。MIN_INTERVAL_S 未満は自動回転無効。
  const autoPlayIntervalMs =
    config.autoPlayInterval >= MIN_INTERVAL_S
      ? config.autoPlayInterval * 1000
      : 0;
  const autoPlayConfigured = autoPlayIntervalMs > 0 && count > 1;
  const autoPlayEnabled = isPlaying && !reduceMotion && autoPlayConfigured;

  // 進捗バーを GSAP 単一 tween で駆動し、満了で次スライドへ前進（setInterval を兼ねる）。
  // 「進捗の可視化」と「自動送りのタイミング」を完全同期させる。
  // タブ非表示中は rAF が止まるため tween も自然に停止する。
  const runProgress = useEffectEvent(() => {
    progressTweenRef.current?.kill();
    progressTweenRef.current = null;
    for (const el of progressFillsRef.current) {
      if (el) gsap.set(el, { scaleX: 0, transformOrigin: "left center" });
    }
    const activeFill = progressFillsRef.current[activeIndex];
    if (!activeFill) return;
    if (!autoPlayEnabled) {
      // 停止中 / reduced-motion: アクティブバーは満杯で静止（現在地を明示）
      gsap.set(activeFill, { scaleX: 1, transformOrigin: "left center" });
      return;
    }
    const tween = gsap.to(activeFill, {
      scaleX: 1,
      duration: autoPlayIntervalMs / 1000,
      ease: EASE.none,
      onComplete: () => {
        advance(1);
      },
    });
    progressTweenRef.current = tween;
    if (isHoveredRef.current) tween.pause(); // ホバー中なら停止状態で開始
  });

  // アクティブスライド or 再生条件が変わるたびに進捗バーを再構築。
  useEffect(() => {
    runProgress();
  }, [activeIndex, autoPlayEnabled]);

  // アンマウント時の GSAP cleanup（Pattern C 要件）
  useEffect(() => {
    const fills = progressFillsRef.current;
    return () => {
      progressTweenRef.current?.kill();
      for (const fill of fills) {
        if (fill) gsap.killTweensOf(fill);
      }
    };
  }, []);

  // ホバー中は進捗バー（=自動送り）を一時停止（離れたら再開）
  const handlePointerEnter = () => {
    isHoveredRef.current = true;
    progressTweenRef.current?.pause();
  };
  const handlePointerLeave = () => {
    isHoveredRef.current = false;
    if (isPlaying) progressTweenRef.current?.resume();
  };
  // フォーカスがカルーセルに入ったら回転停止（APG: ユーザーの明示操作まで再開しない）
  const handleFocusCapture = () => {
    setIsPlaying(false);
  };

  if (count === 0) return null;

  // Render only ±VISIBLE_COUNT cards around the active scroll index.
  const visibleCards: Array<{
    readonly i: number;
    readonly offset: number;
    readonly distance: number;
  }> = [];
  for (let d = -VISIBLE_COUNT; d <= VISIBLE_COUNT; d++) {
    const i = scrollIndex + d;
    if (i >= 0 && i < totalCards) {
      visibleCards.push({ i, offset: d, distance: Math.abs(d) });
    }
  }

  const hasTitle = config.title.length > 0;

  return (
    <SectionWrapper style={style} layout={config.layout}>
      {hasTitle && (
        <div className="mb-12 text-center md:mb-16">
          <ScrollReveal>
            {config.sectionLabel ? (
              <SectionLabel>{config.sectionLabel}</SectionLabel>
            ) : null}
            <div className="mt-4" style={getTitleStyle(style)}>
              <Heading
                level={2}
                className={cn(getTitleClasses(style), "tracking-tight")}
              >
                <PortableTextSpans spans={config.title} />
              </Heading>
            </div>
          </ScrollReveal>
        </div>
      )}
      <div
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
      >
        <div
          ref={carouselRef}
          className="relative overflow-hidden px-5 outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 md:px-10"
          role="region"
          aria-label={spansToPlainText(config.title)}
          aria-roledescription="carousel"
          aria-live={autoPlayEnabled ? "off" : "polite"}
          tabIndex={0}
          onKeyDown={handleKeyDown}
          onFocusCapture={handleFocusCapture}
        >
          <div
            className="relative flex items-center justify-center"
            style={{ height: `${trackHeight}px` }}
          >
            {visibleCards.map(({ i, offset, distance }) => {
              const realIdx = wrapIndex(i, safeCount);
              const space = spaces[realIdx];
              if (!space) return null;
              const { zIndex, scale, opacity } = getCardStyle(distance);
              const isActive = distance === 0;
              const translateX = offset * cardStep;

              return (
                <div
                  key={`card-${String(i)}`}
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
                            !reduceMotion &&
                              "transition-transform duration-700",
                            isActive &&
                              !reduceMotion &&
                              "group-hover:scale-[1.08]",
                          )}
                          sizes={dims.sizes}
                        />
                      ) : (
                        <div className="h-full w-full bg-card" />
                      )}
                      {isActive ? (
                        <div
                          className={cn(
                            "pointer-events-none absolute inset-0 hidden flex-col justify-end bg-foreground p-4 opacity-0 md:flex md:p-5",
                            !reduceMotion &&
                              "transition-opacity duration-700 group-hover:opacity-100",
                          )}
                        >
                          {space.categoryName ? (
                            <span className="text-eyebrow uppercase text-accent-foreground">
                              {space.categoryName}
                            </span>
                          ) : null}
                          <p className="mt-1 font-heading text-h3 font-light text-accent-foreground">
                            {space.name}
                          </p>
                          <div className="mt-3 flex items-baseline gap-4 text-[0.8rem] text-accent-foreground">
                            {space.area != null ? (
                              <span>広さ {space.area}m²</span>
                            ) : null}
                            {space.capacity != null ? (
                              <span>定員 {space.capacity}名</span>
                            ) : null}
                          </div>
                          {space.hourlyPrice != null ? (
                            <p className="mt-2 text-base font-light text-accent-foreground">
                              {formatUnit(space.hourlyPrice, "/h")}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </button>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            aria-label="前のスペース"
            onClick={handlePrev}
            className="absolute left-4 top-1/2 z-30 hidden -translate-y-1/2 border border-border bg-background/80 p-3 backdrop-blur-sm transition-colors duration-200 hover:border-foreground/30 md:flex lg:left-8"
          >
            <IconChevronLeft
              className="h-5 w-5 text-foreground"
              aria-hidden="true"
            />
          </button>
          <button
            type="button"
            aria-label="次のスペース"
            onClick={handleNext}
            className="absolute right-4 top-1/2 z-30 hidden -translate-y-1/2 border border-border bg-background/80 p-3 backdrop-blur-sm transition-colors duration-200 hover:border-foreground/30 md:flex lg:right-8"
          >
            <IconChevronRight
              className="h-5 w-5 text-foreground"
              aria-hidden="true"
            />
          </button>
        </div>

        {activeSpace ? (
          <div className="mx-auto mt-8 max-w-2xl text-center md:mt-14">
            {activeSpace.categoryName ? (
              <span className="text-eyebrow uppercase text-muted-foreground">
                {activeSpace.categoryName}
              </span>
            ) : null}
            <h3 className="mt-2 font-heading text-h3 font-light md:text-h2">
              {activeSpace.name}
            </h3>
            {activeSpace.hourlyPrice != null ? (
              <div className="mt-3 flex items-baseline justify-center gap-4 text-base font-light md:gap-6 md:text-lg">
                <p>{formatUnit(activeSpace.hourlyPrice, "/h")}</p>
              </div>
            ) : null}
            <div className="mt-2 flex items-center justify-center gap-4 text-sm text-muted-foreground md:gap-6">
              {activeSpace.area != null ? (
                <span>広さ {activeSpace.area}m²</span>
              ) : null}
              {activeSpace.capacity != null ? (
                <span>定員 {activeSpace.capacity}名</span>
              ) : null}
            </div>
            {activeSpace.descriptionPlainText ? (
              <p className="mt-4 line-clamp-2 text-sm leading-relaxed text-muted-foreground md:text-base">
                {activeSpace.descriptionPlainText}
              </p>
            ) : null}
            <div className="mt-5">
              <Button
                variant="editorial"
                href={toAppRoute(`/spaces/${activeSpace.slug}`)}
                className="text-xs uppercase tracking-eyebrow"
              >
                View Details
              </Button>
            </div>
            <Link
              href="/spaces"
              className="mt-3 inline-flex min-h-11 items-center gap-1 px-3 py-1.5 text-eyebrow uppercase text-muted-foreground/70 transition-colors duration-300 hover:text-foreground"
            >
              すべてのスペースを見る
              <IconArrowRight className="h-3 w-3" aria-hidden="true" />
            </Link>

            <div className="relative mt-6 flex items-center justify-center">
              <div
                className="flex items-center gap-1.5"
                role="group"
                aria-label="表示するスライドを選択"
              >
                {spaces.map((space, i) => (
                  <button
                    key={space.id}
                    type="button"
                    aria-label={`${space.name}へ移動`}
                    aria-disabled={i === activeIndex}
                    onClick={() => jumpToDot(i)}
                    className="flex min-h-[var(--touch-target-min)] min-w-[var(--touch-target-min)] items-center justify-center"
                  >
                    <span
                      className={cn(
                        "relative block h-[3px] overflow-hidden rounded-full transition-[width] duration-500",
                        i === activeIndex ? "w-10" : "w-4",
                      )}
                    >
                      {/* track */}
                      <span
                        className="absolute inset-0 rounded-full bg-foreground/15"
                        aria-hidden="true"
                      />
                      {/* progress fill — GSAP が scaleX 0→1 で駆動 */}
                      <span
                        ref={(el) => {
                          progressFillsRef.current[i] = el;
                        }}
                        className="absolute inset-0 rounded-full bg-accent"
                        style={{ transform: "scaleX(0)" }}
                        aria-hidden="true"
                      />
                    </span>
                  </button>
                ))}
              </div>

              {autoPlayConfigured && !reduceMotion ? (
                <button
                  type="button"
                  onClick={() => setIsPlaying((prev) => !prev)}
                  aria-label={
                    isPlaying
                      ? "スライドショーを一時停止"
                      : "スライドショーを再生"
                  }
                  className="absolute right-0 flex min-h-[var(--touch-target-min)] min-w-[var(--touch-target-min)] items-center justify-center text-muted-foreground transition-colors duration-200 hover:text-foreground"
                >
                  {isPlaying ? (
                    <IconPlayerPauseFilled
                      className="h-4 w-4"
                      aria-hidden="true"
                    />
                  ) : (
                    <IconPlayerPlayFilled
                      className="h-4 w-4"
                      aria-hidden="true"
                    />
                  )}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </SectionWrapper>
  );
}

"use client";

/**
 * Editorial split PageHero — 雑誌カバー風 2 列 + モバイルオーバーレイ。
 * GSAP / reduced-motion パターンは従来の homepage ヒーローと同一。
 */

import {
  useRef,
  useState,
  useEffect,
  useEffectEvent,
  useSyncExternalStore,
  type ReactElement,
  type TouchEvent as ReactTouchEvent,
} from "react";
import Image from "next/image";
import {
  IconPlayerPauseFilled,
  IconPlayerPlayFilled,
} from "@tabler/icons-react";
import { Button } from "@/public/components/design-system/button";
import { useGSAP } from "@gsap/react";
import { gsap } from "@/public/lib/gsap-config";
import { SplitText } from "@/public/components/animations/split-text";
import { ScrollReveal } from "@/public/components/animations/scroll-reveal";
import { DURATION, EASE, REVEAL } from "@/public/lib/animations";
import { cn } from "@/shared/lib/cn";
import { isAppRoute } from "@/shared/lib/typed-routes";
import type {
  HeroTransition,
  PageHeroConfig,
} from "@/shared/lib/sections/definitions/page-hero";
import { DEFAULT_PAGE_HERO } from "@/shared/lib/sections/definitions/page-hero/defaults";
import { PortableText } from "@/shared/components/portable-text/PortableText";
import { PortableTextSpans } from "@/shared/components/portable-text/PortableTextSpans";

export type EditorialSplitHeroProps = Omit<
  Extract<PageHeroConfig, { variant: "editorial-split" }>,
  "variant"
>;

// prop default は seed 正本 DEFAULT_PAGE_HERO から導出（SSoT、drift 防止）。
// 旧 editorialSplitHeroDefaults / HeroImage / DEFAULT_IMAGE のローカル定義は廃止。
const { variant: _variant, ...editorialSplitHeroDefaults } = DEFAULT_PAGE_HERO;

const AUTO_ADVANCE_MS = 6000;
const SWIPE_THRESHOLD_PX = 50;

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

function transitionCrossfade(
  prevEl: HTMLDivElement,
  nextEl: HTMLDivElement,
): void {
  gsap.to(prevEl, { opacity: 0, duration: DURATION.hero, ease: EASE.inOut });
  gsap.to(nextEl, { opacity: 1, duration: DURATION.hero, ease: EASE.inOut });
}

function transitionKenBurns(
  prevEl: HTMLDivElement,
  nextEl: HTMLDivElement,
): void {
  gsap.killTweensOf(prevEl.firstElementChild);
  gsap.to(prevEl, { opacity: 0, duration: DURATION.hero, ease: EASE.inOut });
  gsap.to(nextEl, { opacity: 1, duration: DURATION.hero, ease: EASE.inOut });
  const img = nextEl.firstElementChild;
  if (img) {
    gsap.fromTo(
      img,
      { scale: 1, x: "0%", y: "0%" },
      {
        scale: 1.08,
        x: "2%",
        y: "1%",
        duration: AUTO_ADVANCE_MS / 1000,
        ease: EASE.none,
      },
    );
  }
}

function transitionClipReveal(
  prevEl: HTMLDivElement,
  nextEl: HTMLDivElement,
): void {
  gsap.set(nextEl, { opacity: 1, clipPath: REVEAL.clipPath.from });
  gsap.to(nextEl, {
    clipPath: REVEAL.clipPath.to,
    duration: DURATION.hero,
    ease: EASE.outCubic,
  });
  gsap.to(prevEl, {
    opacity: 0,
    duration: 0.01,
    delay: DURATION.hero,
  });
}

function transitionScaleFade(
  prevEl: HTMLDivElement,
  nextEl: HTMLDivElement,
): void {
  gsap.to(prevEl, {
    scale: 1.05,
    opacity: 0,
    duration: DURATION.hero,
    ease: EASE.inOut,
  });
  gsap.fromTo(
    nextEl,
    { scale: 0.97, opacity: 0 },
    { scale: 1, opacity: 1, duration: DURATION.hero, ease: EASE.out },
  );
}

function transitionInstant(
  prevEl: HTMLDivElement,
  nextEl: HTMLDivElement,
): void {
  gsap.set(prevEl, { opacity: 0, scale: 1, clipPath: "none" });
  gsap.set(nextEl, { opacity: 1, scale: 1, clipPath: "none" });
}

const TRANSITIONS: Record<
  HeroTransition,
  (prev: HTMLDivElement, next: HTMLDivElement) => void
> = {
  crossfade: transitionCrossfade,
  "ken-burns": transitionKenBurns,
  "clip-reveal": transitionClipReveal,
  "scale-fade": transitionScaleFade,
};

export function EditorialSplitHero({
  label = editorialSplitHeroDefaults.label,
  title = editorialSplitHeroDefaults.title,
  description = editorialSplitHeroDefaults.description,
  images = editorialSplitHeroDefaults.images,
  transition = editorialSplitHeroDefaults.transition,
  buttons = editorialSplitHeroDefaults.buttons,
}: Partial<EditorialSplitHeroProps> = {}): ReactElement {
  const contentRef = useRef<HTMLDivElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const imageElsRef = useRef<(HTMLDivElement | null)[]>([]);
  const activeIndexRef = useRef(0);
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const progressFillsRef = useRef<(HTMLSpanElement | null)[]>([]);
  const progressTweenRef = useRef<ReturnType<typeof gsap.to> | null>(null);

  const resolvedImages =
    images.length > 0 ? images : editorialSplitHeroDefaults.images;
  const count = resolvedImages.length;
  const hasMultiple = count > 1;

  const [activeIndex, setActiveIndex] = useState(0);

  // reduced-motion（React 19 公式: matchMedia は useSyncExternalStore で購読）
  const reduceMotion = useSyncExternalStore(
    subscribeReduceMotion,
    getReduceMotionSnapshot,
    getReduceMotionServerSnapshot,
  );

  // 自動回転の再生状態（ユーザーの明示操作 / フォーカス侵入で false）
  const [isPlaying, setIsPlaying] = useState(true);
  // ホバー中の一時停止（一過性 — 離れたら再開、isPlaying は変えない）
  const isHoveredRef = useRef(false);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.fromTo(
          contentRef.current,
          { opacity: 0, y: REVEAL.fadeUp.y },
          {
            opacity: 1,
            y: 0,
            duration: DURATION.hero,
            ease: EASE.outExpo,
            delay: 0.3,
          },
        );
      });
    },
    { scope: contentRef },
  );

  useGSAP(
    () => {
      if (transition !== "ken-burns" || !hasMultiple) return;
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const firstEl = imageElsRef.current[0];
        const img = firstEl?.firstElementChild;
        if (img) {
          gsap.fromTo(
            img,
            { scale: 1, x: "0%", y: "0%" },
            {
              scale: 1.08,
              x: "2%",
              y: "1%",
              duration: AUTO_ADVANCE_MS / 1000,
              ease: EASE.none,
            },
          );
        }
      });
    },
    { scope: imageContainerRef },
  );

  const crossfadeTo = (nextIndex: number, animate: boolean) => {
    const prevIndex = activeIndexRef.current;
    if (prevIndex === nextIndex) return;

    const prevEl = imageElsRef.current[prevIndex];
    const nextEl = imageElsRef.current[nextIndex];
    if (!prevEl || !nextEl) return;

    if (animate) {
      const transitionFn = TRANSITIONS[transition];
      transitionFn(prevEl, nextEl);
    } else {
      transitionInstant(prevEl, nextEl);
    }

    activeIndexRef.current = nextIndex;
    setActiveIndex(nextIndex);
  };

  // 自動回転を実際に動かす条件。reduced-motion / 単一画像 / ユーザー停止で無効。
  const autoPlayEnabled = isPlaying && !reduceMotion && hasMultiple;

  // 進捗バーを GSAP で駆動し、満了で次スライドへ前進（setInterval を兼ねる）。
  // 「進捗の可視化」と「自動送りのタイミング」を単一 tween で完全同期させる。
  // タブ非表示中は rAF が止まるため tween も自然に停止する。
  const runProgress = useEffectEvent(() => {
    progressTweenRef.current?.kill();
    progressTweenRef.current = null;
    for (const el of progressFillsRef.current) {
      if (el) gsap.set(el, { scaleX: 0, transformOrigin: "left center" });
    }
    const activeFill = progressFillsRef.current[activeIndexRef.current];
    if (!activeFill) return;
    if (!autoPlayEnabled) {
      // 停止中 / reduced-motion: アクティブバーは満杯で静止（現在地を明示）
      gsap.set(activeFill, { scaleX: 1, transformOrigin: "left center" });
      return;
    }
    const tween = gsap.to(activeFill, {
      scaleX: 1,
      duration: AUTO_ADVANCE_MS / 1000,
      ease: EASE.none,
      onComplete: () => {
        crossfadeTo((activeIndexRef.current + 1) % count, true);
      },
    });
    progressTweenRef.current = tween;
    if (isHoveredRef.current) tween.pause(); // ホバー中なら停止状態で開始
  });

  // アクティブスライド or 再生条件が変わるたびに進捗バーを再構築。
  useEffect(() => {
    runProgress();
  }, [activeIndex, autoPlayEnabled]);

  useEffect(() => {
    const els = imageElsRef.current;
    const fills = progressFillsRef.current;
    return () => {
      progressTweenRef.current?.kill();
      for (const el of els) {
        if (el) {
          gsap.killTweensOf(el);
          if (el.firstElementChild) gsap.killTweensOf(el.firstElementChild);
        }
      }
      for (const fill of fills) {
        if (fill) gsap.killTweensOf(fill);
      }
    };
  }, []);

  const handleDotClick = (index: number) => {
    crossfadeTo(index, !reduceMotion);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!hasMultiple) return;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      crossfadeTo((activeIndexRef.current - 1 + count) % count, !reduceMotion);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      crossfadeTo((activeIndexRef.current + 1) % count, !reduceMotion);
    }
  };

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

  const handleTouchStart = (e: ReactTouchEvent<HTMLDivElement>) => {
    const touch = e.touches[0];
    touchStartXRef.current = touch?.clientX ?? null;
    touchStartYRef.current = touch?.clientY ?? null;
  };

  const handleTouchEnd = (e: ReactTouchEvent<HTMLDivElement>) => {
    const startX = touchStartXRef.current;
    const startY = touchStartYRef.current;
    touchStartXRef.current = null;
    touchStartYRef.current = null;
    if (startX === null || startY === null || !hasMultiple) return;

    const touch = e.changedTouches[0];
    if (!touch) return;
    const deltaX = touch.clientX - startX;
    const deltaY = touch.clientY - startY;

    if (Math.abs(deltaX) < Math.abs(deltaY)) return;
    if (Math.abs(deltaX) < SWIPE_THRESHOLD_PX) return;

    const direction = deltaX < 0 ? 1 : -1;
    const nextIndex = (activeIndexRef.current + direction + count) % count;
    setIsPlaying(false); // スワイプ操作後は自動回転を止める
    crossfadeTo(nextIndex, !reduceMotion);
  };

  const padXMobile =
    "ps-[var(--container-padding-start)] pe-[var(--container-padding-end)]";
  const padXDesktop =
    "md:ps-[var(--container-padding-start)] md:pe-[var(--container-padding-end)]";

  return (
    <section
      data-hero=""
      className={cn(
        "grid grid-cols-1",
        "md:min-h-[var(--hero-min-height-xl)] md:grid-cols-2 md:grid-rows-[1fr_1fr]",
      )}
    >
      <div
        ref={imageContainerRef}
        className={cn(
          "relative col-start-1 row-start-1 aspect-[4/3] overflow-hidden bg-card outline-none",
          "md:aspect-auto md:row-span-2 md:min-h-0",
          hasMultiple &&
            "focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset",
        )}
        role={hasMultiple ? "region" : undefined}
        aria-roledescription={hasMultiple ? "carousel" : undefined}
        aria-label={
          hasMultiple ? `ヒーロー画像 — ${count}枚` : resolvedImages[0]?.alt
        }
        aria-live={
          !hasMultiple ? undefined : autoPlayEnabled ? "off" : "polite"
        }
        {...(hasMultiple && {
          tabIndex: 0,
          onKeyDown: handleKeyDown,
          onFocusCapture: handleFocusCapture,
          onPointerEnter: handlePointerEnter,
          onPointerLeave: handlePointerLeave,
        })}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {resolvedImages.map((img, i) => (
          <div
            key={img.url}
            ref={(el) => {
              imageElsRef.current[i] = el;
            }}
            className="absolute inset-0"
            style={{ opacity: i === 0 ? 1 : 0 }}
            aria-hidden={i !== activeIndex}
            {...(hasMultiple && {
              role: "group",
              "aria-roledescription": "スライド",
              "aria-label": `${i + 1} / ${count}`,
            })}
          >
            <Image
              src={img.url}
              alt={i === activeIndex ? img.alt : ""}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 50vw"
              priority={i === 0}
            />
          </div>
        ))}

        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-foreground/60 via-foreground/25 to-transparent md:hidden"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-foreground/90 via-foreground/45 to-transparent md:hidden"
          aria-hidden="true"
        />

        {hasMultiple ? (
          <p
            className="pointer-events-none absolute top-6 right-6 z-20 text-eyebrow-lg uppercase tabular-nums text-background"
            style={{
              paintOrder: "stroke fill",
              WebkitTextStroke: "0.4px rgba(0,0,0,0.5)",
              textShadow: "0 1px 3px rgba(0,0,0,0.55)",
            }}
            aria-hidden="true"
          >
            {String(activeIndex + 1).padStart(2, "0")}
            <span className="mx-1 text-background/70">/</span>
            {String(count).padStart(2, "0")}
          </p>
        ) : null}

        {hasMultiple ? (
          <div className="absolute inset-x-0 bottom-6 z-20 flex items-center justify-center">
            <div
              className="flex items-center gap-1.5"
              role="group"
              aria-label="表示するスライドを選択"
            >
              {resolvedImages.map((img, i) => (
                <button
                  key={img.url}
                  type="button"
                  aria-label={`${i + 1}枚目を表示`}
                  aria-disabled={i === activeIndex}
                  onClick={() => handleDotClick(i)}
                  className="flex min-h-[var(--touch-target-min)] min-w-[var(--touch-target-min)] items-center justify-center"
                >
                  <span
                    className={cn(
                      "relative block h-[3px] overflow-hidden rounded-full shadow-[0_1px_3px_rgba(0,0,0,0.35)] transition-[width] duration-500",
                      i === activeIndex ? "w-10" : "w-4",
                    )}
                  >
                    {/* track */}
                    <span
                      className="absolute inset-0 rounded-full bg-background/40"
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

            {!reduceMotion ? (
              <button
                type="button"
                onClick={() => setIsPlaying((prev) => !prev)}
                aria-label={
                  isPlaying
                    ? "スライドショーを一時停止"
                    : "スライドショーを再生"
                }
                className="absolute right-2 flex min-h-[var(--touch-target-min)] min-w-[var(--touch-target-min)] items-center justify-center text-background [filter:drop-shadow(0_1px_3px_rgb(0_0_0/0.5))]"
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
        ) : null}
      </div>

      <div
        ref={contentRef}
        className={cn(
          "relative z-10 flex flex-col justify-end",
          "col-start-1 row-start-1 pointer-events-none",
          padXMobile,
          "pb-[calc(var(--spacing-fluid-md)+env(safe-area-inset-bottom,0px))]",
          "md:col-start-2 md:row-start-1 md:pointer-events-auto",
          "md:bg-background md:pt-16 md:pb-6",
          padXDesktop,
        )}
      >
        <p
          className={cn(
            "mb-6 text-eyebrow-lg uppercase",
            "text-background",
            "[paint-order:stroke_fill]",
            "[-webkit-text-stroke:0.4px_rgb(0_0_0/0.4)]",
            "[text-shadow:0_1px_3px_rgb(0_0_0/0.55)]",
            "md:text-muted-foreground md:mb-8",
            "md:[paint-order:normal]",
            "md:[-webkit-text-stroke:0px_transparent]",
            "md:[text-shadow:none]",
          )}
        >
          <PortableTextSpans spans={label} />
        </p>

        <h1
          className={cn(
            "text-[clamp(3.5rem,10vw,5rem)] font-heading font-light leading-[1.08] tracking-tight",
            "text-background",
            "[paint-order:stroke_fill]",
            "[-webkit-text-stroke:0.5px_rgb(0_0_0/0.45)]",
            "md:text-foreground",
            "md:[paint-order:normal]",
            "md:[-webkit-text-stroke:0px_transparent]",
          )}
        >
          <SplitText trigger={false} delay={0.5}>
            <PortableTextSpans spans={title} />
          </SplitText>
        </h1>

        <div
          className={cn("mt-5 h-px w-12 bg-accent", "md:mt-8")}
          aria-hidden="true"
        />
      </div>

      <div
        className={cn(
          "col-start-1 row-start-2 flex flex-col bg-background pt-8",
          padXMobile,
          "pb-[calc(var(--spacing-fluid-md)+env(safe-area-inset-bottom,0px))]",
          "md:col-start-2 md:row-start-2 md:pt-6 md:pb-16",
          padXDesktop,
        )}
      >
        <ScrollReveal delay={0.3}>
          <div className="max-w-lg text-xl text-muted-foreground md:text-2xl [&_p]:mt-0 [&_p+p]:mt-5">
            <PortableText blocks={description} />
          </div>
        </ScrollReveal>

        {buttons.length > 0 && (
          <ScrollReveal delay={0.4} className="mt-10 md:mt-12">
            <div className="flex flex-col items-start gap-3 sm:flex-row sm:gap-4">
              {buttons.map((btn) => (
                <Button
                  key={btn.url}
                  variant="editorial"
                  href={isAppRoute(btn.url) ? btn.url : "/reservation"}
                  className="inline-flex min-h-[var(--touch-target-min)] items-center justify-center text-xs uppercase tracking-[0.18em]"
                  {...(btn.openInNewTab && { target: "_blank" as const })}
                  label={btn.label}
                />
              ))}
            </div>
          </ScrollReveal>
        )}
      </div>
    </section>
  );
}

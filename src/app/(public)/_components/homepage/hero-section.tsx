"use client";

import {
  useRef,
  useState,
  useEffect,
  useEffectEvent,
  type ReactElement,
  type TouchEvent as ReactTouchEvent,
} from "react";
import Image from "next/image";
import { Button } from "@/public/components/design-system/button";
import { useGSAP } from "@gsap/react";
import { gsap } from "@/public/lib/gsap-config";
import { useMotionPreference } from "@/public/hooks/use-motion-preference";
import { SplitText } from "@/public/components/animations/split-text";
import { ScrollReveal } from "@/public/components/animations/scroll-reveal";
import { DURATION, EASE, REVEAL } from "@/public/lib/animations";
import { cn } from "@/shared/lib/cn";
import type { HeroTransition } from "@/shared/lib/sections/definitions/homepage-hero/schema";

/* -------------------------------------------------------------------------- */
/*  Types & defaults                                                          */
/* -------------------------------------------------------------------------- */

export interface HeroImage {
  readonly url: string;
  readonly alt: string;
}

export interface HeroSectionProps {
  readonly label: string;
  readonly title: string;
  readonly description: string;
  readonly images: readonly HeroImage[];
  readonly transition: HeroTransition;
  readonly buttonText: string;
  readonly buttonUrl: string;
}

const DEFAULT_IMAGE: HeroImage = {
  url: "https://images.unsplash.com/photo-1497366216548-37526070297c?w=1200&q=80",
  alt: "自然光が差し込む開放的なレンタルスペース",
};

export const heroDefaultProps: HeroSectionProps = {
  label: "Volume One — Spring 2026",
  title: "Where silence works.",
  description:
    "静けさが仕事をする場所。Myrrh は光と余白を大切にした、思考のためのレンタルスペースです。",
  images: [DEFAULT_IMAGE],
  transition: "crossfade",
  buttonText: "Reserve a space",
  buttonUrl: "/reservation",
};

/** Auto-advance interval in milliseconds */
const AUTO_ADVANCE_MS = 6000;

/** Minimum horizontal swipe distance (px) to trigger image change */
const SWIPE_THRESHOLD_PX = 50;

/* -------------------------------------------------------------------------- */
/*  Transition animations (Pattern C: event-driven)                           */
/* -------------------------------------------------------------------------- */

/**
 * Crossfade — soft dissolve between images.
 */
function transitionCrossfade(
  prevEl: HTMLDivElement,
  nextEl: HTMLDivElement,
): void {
  gsap.to(prevEl, { opacity: 0, duration: DURATION.hero, ease: EASE.inOut });
  gsap.to(nextEl, { opacity: 1, duration: DURATION.hero, ease: EASE.inOut });
}

/**
 * Ken Burns — slow zoom+pan on active image with crossfade.
 * The zoom tween runs for the full auto-advance interval.
 */
function transitionKenBurns(
  prevEl: HTMLDivElement,
  nextEl: HTMLDivElement,
): void {
  // Stop any running Ken Burns zoom on the previous image
  gsap.killTweensOf(prevEl.firstElementChild);

  // Crossfade
  gsap.to(prevEl, { opacity: 0, duration: DURATION.hero, ease: EASE.inOut });
  gsap.to(nextEl, { opacity: 1, duration: DURATION.hero, ease: EASE.inOut });

  // Start slow zoom+pan on the next image (the <Image> wrapper)
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

/**
 * Clip-path reveal — next image slides in from left using clip-path.
 * Uses REVEAL.clipPath constants.
 */
function transitionClipReveal(
  prevEl: HTMLDivElement,
  nextEl: HTMLDivElement,
): void {
  // Ensure next is visible but clipped
  gsap.set(nextEl, { opacity: 1, clipPath: REVEAL.clipPath.from });

  // Reveal next image left-to-right
  gsap.to(nextEl, {
    clipPath: REVEAL.clipPath.to,
    duration: DURATION.hero,
    ease: EASE.outCubic,
  });

  // Hide prev after reveal completes
  gsap.to(prevEl, {
    opacity: 0,
    duration: 0.01,
    delay: DURATION.hero,
  });
}

/**
 * Scale-fade — current image zooms out slightly while fading,
 * next image zooms in from slightly smaller.
 */
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

/** Instant switch for reduced-motion */
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

/* -------------------------------------------------------------------------- */
/*  Component                                                                 */
/* -------------------------------------------------------------------------- */

export function HomepageHero({
  label = heroDefaultProps.label,
  title = heroDefaultProps.title,
  description = heroDefaultProps.description,
  images = heroDefaultProps.images,
  transition = heroDefaultProps.transition,
  buttonText = heroDefaultProps.buttonText,
  buttonUrl = heroDefaultProps.buttonUrl,
}: Partial<HeroSectionProps> = {}): ReactElement {
  const contentRef = useRef<HTMLDivElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const imageElsRef = useRef<(HTMLDivElement | null)[]>([]);
  const activeIndexRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const touchStartXRef = useRef<number | null>(null);
  const touchStartYRef = useRef<number | null>(null);
  const motionOkRef = useMotionPreference();

  const resolvedImages = images.length > 0 ? images : heroDefaultProps.images;
  const count = resolvedImages.length;
  const hasMultiple = count > 1;

  const [activeIndex, setActiveIndex] = useState(0);

  /* ── Content entrance (Pattern A: matchMedia + useGSAP) ────────────── */
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

  /* ── Ken Burns: start initial zoom on first image ──────────────────── */
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

  /* ── Crossfade transition (Pattern C: event-driven) ────────────────── */
  const crossfadeTo = (nextIndex: number) => {
    const prevIndex = activeIndexRef.current;
    if (prevIndex === nextIndex) return;

    const prevEl = imageElsRef.current[prevIndex];
    const nextEl = imageElsRef.current[nextIndex];
    if (!prevEl || !nextEl) return;

    if (motionOkRef.current) {
      const transitionFn = TRANSITIONS[transition];
      transitionFn(prevEl, nextEl);
    } else {
      transitionInstant(prevEl, nextEl);
    }

    activeIndexRef.current = nextIndex;
    setActiveIndex(nextIndex);
  };

  /* ── Auto-advance timer ─────────────────────────────────────────────── */
  const stopTimer = () => {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const startTimer = () => {
    stopTimer();
    if (!hasMultiple) return;
    timerRef.current = setInterval(() => {
      crossfadeTo((activeIndexRef.current + 1) % count);
    }, AUTO_ADVANCE_MS);
  };

  const onTimerStart = useEffectEvent(() => {
    startTimer();
  });

  useEffect(() => {
    onTimerStart();
    return stopTimer;
  }, [hasMultiple, count]);

  // Cleanup GSAP tweens on image elements at unmount (Pattern C requirement)
  useEffect(() => {
    const els = imageElsRef.current;
    return () => {
      for (const el of els) {
        if (el) {
          gsap.killTweensOf(el);
          // Also kill tweens on the inner <img> wrapper (Ken Burns)
          if (el.firstElementChild) gsap.killTweensOf(el.firstElementChild);
        }
      }
    };
  }, []);

  /* ── Dot click handler — restarts timer for full interval ──────────── */
  const handleDotClick = (index: number) => {
    crossfadeTo(index);
    startTimer();
  };

  /* ── Touch swipe handlers (Pattern C: event-driven) ─────────────────── */
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

    // Skip if vertical movement dominates (user scroll intent)
    if (Math.abs(deltaX) < Math.abs(deltaY)) return;
    if (Math.abs(deltaX) < SWIPE_THRESHOLD_PX) return;

    const direction = deltaX < 0 ? 1 : -1;
    const nextIndex = (activeIndexRef.current + direction + count) % count;
    crossfadeTo(nextIndex);
    startTimer();
  };

  /* ── Render ─────────────────────────────────────────────────────────── */
  return (
    <section
      data-hero=""
      className={cn(
        // Mobile: image + headline overlap on row 1, body on row 2
        "grid grid-cols-1",
        // Desktop: 2 cols × 2 rows — image spans left full height, headline top-right, body bottom-right
        "md:min-h-[var(--hero-min-height-xl)] md:grid-cols-2 md:grid-rows-[1fr_1fr]",
      )}
    >
      {/* Image carousel — mobile row 1 / desktop left col spanning both rows */}
      <div
        ref={imageContainerRef}
        className={cn(
          "relative col-start-1 row-start-1 aspect-[4/3] overflow-hidden bg-card",
          "md:aspect-auto md:row-span-2 md:min-h-0",
        )}
        role={hasMultiple ? "region" : undefined}
        aria-roledescription={hasMultiple ? "carousel" : undefined}
        aria-label={
          hasMultiple ? `ヒーロー画像 — ${count}枚` : resolvedImages[0]?.alt
        }
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Stacked images with transition */}
        {resolvedImages.map((img, i) => (
          <div
            key={img.url}
            ref={(el) => {
              imageElsRef.current[i] = el;
            }}
            className="absolute inset-0"
            style={{ opacity: i === 0 ? 1 : 0 }}
            aria-hidden={i !== activeIndex}
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

        {/* Mobile-only scrim gradients for overlay text readability */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-foreground/60 via-foreground/25 to-transparent md:hidden"
          aria-hidden="true"
        />
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-foreground/90 via-foreground/45 to-transparent md:hidden"
          aria-hidden="true"
        />

        {/* Numbered pagination (top-right) — visible on both breakpoints */}
        {hasMultiple ? (
          <p
            className="pointer-events-none absolute top-6 right-6 z-20 text-[0.75rem] uppercase tracking-[0.18em] tabular-nums text-background"
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

        {/* Dot navigation — bottom center, always visible */}
        {hasMultiple ? (
          <div
            className="absolute bottom-6 left-1/2 z-20 flex -translate-x-1/2 gap-2"
            role="tablist"
            aria-label="画像選択"
          >
            {resolvedImages.map((img, i) => (
              <button
                key={img.url}
                type="button"
                role="tab"
                aria-selected={i === activeIndex}
                aria-label={`画像 ${i + 1}`}
                onClick={() => handleDotClick(i)}
                className={cn(
                  "h-1.5 rounded-full shadow-[0_1px_3px_rgba(0,0,0,0.4)] transition-all duration-500",
                  i === activeIndex
                    ? "w-6 bg-background"
                    : "w-1.5 bg-background/60 hover:bg-background/85",
                )}
              />
            ))}
          </div>
        ) : null}

        {/* Photo credit — bottom-left, always visible */}
        <span
          className="pointer-events-none absolute bottom-4 left-4 z-20 text-[0.625rem] uppercase tracking-[0.15em] text-background/80"
          style={{ textShadow: "0 1px 2px rgba(0,0,0,0.5)" }}
        >
          Photography — Myrrh Studio, 2026
        </span>
      </div>

      {/* Headline (label + title + divider) —
          mobile: overlay on image (same grid cell, z-stacked, bottom-aligned).
          desktop: right column, top row, bottom-aligned to meet body at center. */}
      <div
        ref={contentRef}
        className={cn(
          // Shared layout
          "relative z-10 flex flex-col justify-end",
          // Mobile: same grid cell as image (overlay); disable pointer events so carousel swipe works
          "col-start-1 row-start-1 px-6 pb-14 pointer-events-none",
          // Desktop: right column top row, on white background, pointer events normal
          "md:col-start-2 md:row-start-1 md:pointer-events-auto",
          "md:bg-background md:px-12 md:pt-16 md:pb-6 lg:px-16",
        )}
      >
        <p
          className={cn(
            "mb-6 text-[0.75rem] uppercase tracking-[0.18em]",
            // Mobile: white over image with stroke + shadow (robust on any photo)
            "text-background",
            "[paint-order:stroke_fill]",
            "[-webkit-text-stroke:0.4px_rgb(0_0_0/0.4)]",
            "[text-shadow:0_1px_3px_rgb(0_0_0/0.55)]",
            // Desktop: muted on white, no stroke/shadow needed
            "md:text-muted-foreground md:mb-8",
            "md:[paint-order:normal]",
            "md:[-webkit-text-stroke:0px_transparent]",
            "md:[text-shadow:none]",
          )}
        >
          {label}
        </p>

        <h1
          className={cn(
            // Custom hero-scale — mobile floor 56px (vs --text-hero's 48px floor) for stronger catchphrase impact
            "text-[clamp(3.5rem,10vw,5rem)] font-heading font-light leading-[1.08] tracking-tight",
            // Mobile: white with stroke outline for any background
            "text-background",
            "[paint-order:stroke_fill]",
            "[-webkit-text-stroke:0.5px_rgb(0_0_0/0.45)]",
            // Desktop: normal foreground on white
            "md:text-foreground",
            "md:[paint-order:normal]",
            "md:[-webkit-text-stroke:0px_transparent]",
          )}
        >
          <SplitText trigger={false} delay={0.5}>
            {title}
          </SplitText>
        </h1>

        <div
          className={cn("mt-5 h-px w-12 bg-accent", "md:mt-8")}
          aria-hidden="true"
        />
      </div>

      {/* Body (description + CTA) —
          mobile: below image on white.
          desktop: right column bottom row, top-aligned. */}
      <div
        className={cn(
          "col-start-1 row-start-2 flex flex-col bg-background px-6 pt-8 pb-14",
          "md:col-start-2 md:row-start-2 md:pt-6 md:pb-16 md:px-12 lg:px-16",
        )}
      >
        <ScrollReveal delay={0.3}>
          <p className="max-w-[22rem] text-sm leading-[2.1] text-muted-foreground md:text-base">
            {description}
          </p>
        </ScrollReveal>

        <ScrollReveal delay={0.4}>
          <div className="mt-8 flex justify-center md:mt-10">
            <Button
              variant="editorial"
              href={buttonUrl}
              className="text-xs uppercase tracking-[0.18em]"
            >
              {buttonText}
            </Button>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}

"use client";

import {
  useRef,
  useState,
  useEffect,
  useEffectEvent,
  type ReactElement,
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
  buttonText: "Explore spaces",
  buttonUrl: "/spaces",
};

/** Auto-advance interval in milliseconds */
const AUTO_ADVANCE_MS = 6000;

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

  /* ── Render ─────────────────────────────────────────────────────────── */
  return (
    <section
      className="grid min-h-[85svh] grid-cols-1 md:grid-cols-2"
      data-hero=""
    >
      {/* Left: Image area */}
      <div
        ref={imageContainerRef}
        className="relative min-h-[50svh] overflow-hidden bg-card md:min-h-0"
        role={hasMultiple ? "region" : undefined}
        aria-roledescription={hasMultiple ? "carousel" : undefined}
        aria-label={
          hasMultiple ? `ヒーロー画像 — ${count}枚` : resolvedImages[0]?.alt
        }
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

        {/* Dot indicators */}
        {hasMultiple && (
          <div
            className="absolute bottom-6 left-1/2 z-10 flex -translate-x-1/2 gap-2"
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
                  "h-1.5 rounded-full transition-all duration-500",
                  i === activeIndex
                    ? "w-6 bg-background"
                    : "w-1.5 bg-background/50 hover:bg-background/70",
                )}
              />
            ))}
          </div>
        )}

        <span className="absolute bottom-4 left-4 z-10 text-[0.55rem] uppercase tracking-[0.15em] text-background/50">
          Photography — Myrrh Studio, 2026
        </span>
      </div>

      {/* Right: Text content */}
      <div
        ref={contentRef}
        className="flex flex-col justify-center bg-background px-6 py-12 md:px-12 md:py-16 lg:px-16"
      >
        <p className="mb-8 text-[0.55rem] uppercase tracking-[0.18em] text-muted-foreground md:mb-12">
          {label}
        </p>

        <h1 className="text-hero font-heading font-light leading-[1.08] tracking-tight">
          <SplitText trigger={false} delay={0.5}>
            {title}
          </SplitText>
        </h1>

        <div className="mt-6 h-px w-12 bg-accent md:mt-8" aria-hidden="true" />

        <ScrollReveal delay={0.3}>
          <p className="mt-6 max-w-[22rem] text-sm leading-[2.1] text-muted-foreground md:mt-8 md:text-base">
            {description}
          </p>
        </ScrollReveal>

        <ScrollReveal delay={0.4}>
          <Button
            variant="editorial"
            href={buttonUrl}
            className="mt-8 text-xs uppercase tracking-[0.18em] md:mt-10"
          >
            {buttonText}
          </Button>
        </ScrollReveal>
      </div>
    </section>
  );
}

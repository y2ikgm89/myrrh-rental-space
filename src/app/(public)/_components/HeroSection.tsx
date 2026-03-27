"use client";

/**
 * HeroSection — Full-viewport hero with parallax background + SplitText
 *
 * No pinning. Parallax background image moves on scroll.
 * SplitText animates the catchcopy on load.
 */

import { useRef, type ReactElement } from "react";
import Image from "next/image";
import { useGSAP } from "@gsap/react";
import { gsap } from "@/public/lib/gsap-config";
import { SplitText } from "@/public/components/animations/split-text";
import { MagneticButton } from "@/public/components/animations/magnetic-button";
import { ScrollIndicator } from "@/public/components/layouts/scroll-indicator";
import { DURATION, EASE, SCROLL_TRIGGER } from "@/public/lib/animations";
import {
  CONTENT_POSITION_MAP,
  OVERLAY_STYLE_MAP,
  HERO_PARALLAX_HEIGHT_MAP,
} from "@/public/lib/section-style-maps";
import {
  parseContentPosition,
  parseOverlayStyle,
  parseHeroParallaxHeight,
} from "@/shared/lib/validations/section-parsers";
import type { HeroParallaxConfig } from "@/shared/lib/validations/section";
import type { SectionDesign } from "@/shared/lib/validations/section-design";
import {
  getTitleClasses,
  getTitleStyle,
  getTextStyle,
} from "@/public/components/sections/SectionWrapper";

const DEFAULT_BG_IMAGE =
  "https://images.unsplash.com/photo-1519167758481-83f550bb49b3?w=1600&q=80";

interface HeroSectionProps {
  readonly config: HeroParallaxConfig;
  readonly design: SectionDesign;
}

export function HeroSection({
  config,
  design,
}: HeroSectionProps): ReactElement {
  const sectionRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const section = sectionRef.current;
      const content = contentRef.current;
      const image = imageRef.current;
      if (!section || !content || !image) return;

      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        // Content entrance
        gsap.fromTo(
          content,
          { opacity: 0, y: 50 },
          {
            opacity: 1,
            y: 0,
            duration: DURATION.hero,
            ease: EASE.outExpo,
            delay: 0.3,
          },
        );

        // Parallax background — config.parallaxSpeed controls displacement (0..1 → 0..200px)
        const displacement = config.parallaxSpeed * 200;
        gsap.set(image, { scale: 1.15 });
        gsap.fromTo(
          image,
          { y: -displacement },
          {
            y: displacement,
            ease: EASE.none,
            scrollTrigger: {
              trigger: section,
              ...SCROLL_TRIGGER.scrub,
            },
          },
        );
      });
    },
    { scope: sectionRef },
  );

  const heightClass =
    HERO_PARALLAX_HEIGHT_MAP[parseHeroParallaxHeight(config.height)];
  const positionClasses =
    CONTENT_POSITION_MAP[parseContentPosition(config.contentPosition)];
  // When overlayGradient is disabled, fall back from 'gradient' to 'solid'
  const effectiveOverlayStyle =
    !config.overlayGradient && config.overlayStyle === "gradient"
      ? "solid"
      : config.overlayStyle;
  const overlayStyle = parseOverlayStyle(effectiveOverlayStyle);
  const overlayClass = OVERLAY_STYLE_MAP[overlayStyle];

  return (
    <section
      ref={sectionRef}
      data-hero=""
      className={`relative flex ${heightClass} ${positionClasses} overflow-hidden pt-[var(--header-height)]`}
    >
      {/* Background image with parallax */}
      <div className="absolute inset-0">
        <div ref={imageRef} className="relative h-full w-full">
          <Image
            src={config.backgroundImageUrl || DEFAULT_BG_IMAGE}
            alt="洗練されたレンタルスペースのインテリア"
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
        </div>
      </div>

      {/* Overlay */}
      {overlayStyle !== "none" && (
        <div
          className={`absolute inset-0 ${overlayClass}`}
          aria-hidden="true"
        />
      )}

      {/* Content */}
      <div ref={contentRef} className="relative z-10 px-5 md:px-8">
        {config.tagline && (
          <p className="mb-6 text-[11px] uppercase tracking-[0.3em] text-primary-dark md:tracking-[0.4em]">
            {config.tagline}
          </p>
        )}

        <h1
          className={`font-heading ${getTitleClasses(design)} font-bold leading-[1.15] tracking-tight`}
          style={getTitleStyle(design)}
        >
          <SplitText variant="words" trigger={false} delay={0.5}>
            {config.title}
          </SplitText>
        </h1>

        <p
          className={`mt-6 max-w-lg text-sm leading-relaxed text-muted-foreground md:mt-8 md:text-base${config.contentPosition === "center" ? " mx-auto" : ""}`}
          style={getTextStyle(design)}
        >
          {config.subtitle}
        </p>

        {config.buttons.length > 0 && (
          <div
            className={`mt-8 flex flex-col gap-4 md:mt-12${config.contentPosition === "center" ? " items-center" : " items-start"}`}
          >
            {config.buttons.map((btn) => (
              <MagneticButton key={btn.url} href={btn.url}>
                {btn.text}
              </MagneticButton>
            ))}
          </div>
        )}
      </div>

      {/* Scroll hint */}
      {config.scrollIndicator !== false && (
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
          <ScrollIndicator />
        </div>
      )}
    </section>
  );
}

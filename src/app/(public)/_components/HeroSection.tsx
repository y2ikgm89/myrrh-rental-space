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
import { Heading } from "@/public/components/design-system/heading";
import { ScrollIndicator } from "@/public/components/layouts/scroll-indicator";
import {
  DURATION,
  EASE,
  REVEAL,
  SCROLL_TRIGGER,
} from "@/public/lib/animations";
import { HERO_PARALLAX_HEIGHT_MAP } from "@/public/lib/section-style-maps";
import { parseHeroParallaxHeight } from "@/shared/lib/validations/section-parsers";
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
          { opacity: REVEAL.fadeUp.opacity, y: REVEAL.fadeUp.y },
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

  return (
    <section
      ref={sectionRef}
      data-hero=""
      className={`relative ${heightClass} overflow-hidden pt-[var(--header-height)]`}
    >
      <div className="mx-auto flex h-full max-w-[var(--container-max)] flex-col md:flex-row">
        {/* Left: Image panel */}
        <div className="relative h-[50vh] w-full md:h-full md:w-1/2">
          <div ref={imageRef} className="absolute inset-0">
            <Image
              src={config.backgroundImageUrl || DEFAULT_BG_IMAGE}
              alt="洗練されたレンタルスペースのインテリア"
              fill
              priority
              sizes="(min-width: 768px) 50vw, 100vw"
              className="object-cover"
            />
          </div>
          {/* Subtle gradient fade into content side */}
          <div
            className="absolute inset-y-0 right-0 hidden w-32 bg-gradient-to-r from-transparent to-background md:block"
            aria-hidden="true"
          />
          {/* Bottom gradient for mobile */}
          <div
            className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background to-transparent md:hidden"
            aria-hidden="true"
          />
        </div>

        {/* Right: Content panel */}
        <div
          ref={contentRef}
          className="flex w-full flex-col justify-center px-6 py-12 md:w-1/2 md:px-12 md:py-0 lg:px-20"
        >
          {config.tagline && (
            <p className="text-[10px] font-medium uppercase tracking-[0.4em] text-accent">
              {config.tagline}
            </p>
          )}

          <div style={getTitleStyle(design)}>
            <Heading
              level={1}
              className={`mt-6 ${getTitleClasses(design)} leading-[1.05]`}
            >
              <SplitText trigger={false} delay={0.5}>
                {config.title}
              </SplitText>
            </Heading>
          </div>

          {/* Decorative divider */}
          <div className="mt-8 h-px w-12 bg-accent/40" aria-hidden="true" />

          {config.subtitle && (
            <p
              className="mt-6 max-w-sm text-sm leading-[2] text-muted-foreground"
              style={getTextStyle(design)}
            >
              {config.subtitle}
            </p>
          )}

          {config.buttons.length > 0 && (
            <div className="mt-10 flex flex-col items-start gap-4">
              {config.buttons.map((btn) => (
                <MagneticButton key={btn.url} href={btn.url}>
                  {btn.text}
                </MagneticButton>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Scroll hint */}
      {config.scrollIndicator !== false && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2">
          <ScrollIndicator />
        </div>
      )}
    </section>
  );
}

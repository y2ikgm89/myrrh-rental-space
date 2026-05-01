"use client";

/**
 * StandardHeroSection — Generic hero with height/overlay/CTA variants
 *
 * Configurable height, background image overlay, SplitText title,
 * and CTA buttons via MagneticButton + text link.
 *
 * `minimal` variant is the DB-driven mini hero used by all system pages:
 * bottom-aligned, gradient background, left-aligned text, chars animation.
 *
 * `default` variant without a background image automatically
 * delegates to the minimal layout for visual consistency.
 */

import { useRef, type ReactElement } from "react";
import Image from "next/image";
import Link from "next/link";
import { useGSAP } from "@gsap/react";
import { gsap } from "@/public/lib/gsap-config";
import { SplitText } from "@/public/components/animations/split-text";
import { ScrollReveal } from "@/public/components/animations/scroll-reveal";
import { MagneticButton } from "@/public/components/animations/magnetic-button";
import { cn } from "@/shared/lib/cn";
import { Container } from "@/public/components/design-system/container";
import { Heading } from "@/public/components/design-system/heading";
import {
  DURATION,
  EASE,
  REVEAL,
  SCROLL_TRIGGER,
} from "@/public/lib/animations";
import type { HeroConfig } from "@/shared/lib/validations/section";
import type { SectionStylePayload } from "@/shared/domain/section-styles/types";
import { toAppRoute } from "@/shared/lib/typed-routes";
import {
  getTitleClasses,
  getTitleStyle,
  getTextStyle,
} from "@/public/components/sections/SectionWrapper";

type HeroButton = HeroConfig["buttons"][number];

function HeroButtons({
  primary,
  secondary,
  className = "flex flex-wrap items-center gap-4",
}: {
  primary: HeroButton | undefined;
  secondary: HeroButton | undefined;
  className?: string;
}) {
  if (!primary && !secondary) return null;
  return (
    <div className={className}>
      {primary && (
        <MagneticButton
          href={primary.url}
          strength={0.35}
          size={primary.size}
          {...(primary.iconName && { iconName: primary.iconName })}
          {...(primary.backgroundColor && {
            customBackgroundColor: primary.backgroundColor,
          })}
          {...(primary.textColor && { customTextColor: primary.textColor })}
          openInNewTab={primary.openInNewTab}
        >
          {primary.text}
        </MagneticButton>
      )}
      {secondary && (
        <Link
          href={toAppRoute(secondary.url)}
          className="group relative inline-block text-xs uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
          {...(secondary.openInNewTab && {
            target: "_blank",
            rel: "noopener noreferrer",
          })}
          {...((secondary.backgroundColor || secondary.textColor) && {
            style: {
              ...(secondary.backgroundColor && {
                backgroundColor: secondary.backgroundColor,
              }),
              ...(secondary.textColor && { color: secondary.textColor }),
            },
          })}
        >
          {secondary.text}
          <span className="absolute bottom-0 left-0 h-px w-0 bg-accent/60 transition-all duration-300 group-hover:w-full" />
        </Link>
      )}
    </div>
  );
}

const HEIGHT_MAP: Record<string, string> = {
  sm: "min-h-[var(--hero-min-height-sm)]",
  md: "min-h-[var(--hero-min-height)]",
  lg: "min-h-[var(--hero-min-height-lg)]",
  full: "min-h-svh",
};

interface StandardHeroSectionProps {
  readonly config: HeroConfig;
  readonly style: SectionStylePayload;
}

export function StandardHeroSection({
  config,
  style,
}: StandardHeroSectionProps): ReactElement {
  const sectionRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLDivElement>(null);

  const variant = config.variant;
  const hasBackground = !!(
    config.backgroundImageUrl ||
    (variant === "video" && config.videoUrl)
  );

  // minimal layout: explicit minimal OR default without background
  const useMinimalLayout =
    variant === "minimal" || (variant === "default" && !hasBackground);

  useGSAP(
    () => {
      // Minimal layout delegates animation to SplitText/ScrollReveal
      if (useMinimalLayout) return;

      const content = contentRef.current;
      if (!content) return;

      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.fromTo(
          content,
          { opacity: REVEAL.fadeUp.opacity, y: REVEAL.fadeUp.y },
          {
            opacity: 1,
            y: 0,
            duration: DURATION.hero,
            ease: EASE.outExpo,
            delay: 0.2,
          },
        );

        // Parallax background when variant is 'parallax'
        const image = imageRef.current;
        const section = sectionRef.current;
        if (!image || !section || variant !== "parallax") return;

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

  const isCustomHeight = config.height === "custom";
  const heightClass = isCustomHeight
    ? undefined
    : (HEIGHT_MAP[config.height] ?? HEIGHT_MAP["md"]);
  const customHeightStyle = isCustomHeight
    ? { minHeight: `${String(config.heightCustom ?? 60)}svh` }
    : undefined;
  const primaryButton = config.buttons.find((b) => b.variant === "primary");
  const secondaryButton = config.buttons.find((b) => b.variant === "secondary");

  // =========================================================================
  // Minimal: bottom-aligned, gradient bg, left-aligned
  // Used by system pages (DB-driven hero sections)
  // =========================================================================
  if (useMinimalLayout) {
    return (
      <section
        ref={sectionRef}
        data-hero=""
        className="relative flex items-end overflow-hidden pb-6 pt-[calc(var(--header-height)+1rem)] md:pb-10 md:pt-[calc(var(--header-height)+1.5rem)]"
      >
        <div
          className="absolute inset-0 bg-gradient-to-b from-surface via-background to-background"
          aria-hidden="true"
        />

        <Container className="relative w-full !max-w-6xl">
          {config.title && (
            <div style={getTitleStyle(style)}>
              <Heading
                level={1}
                className={cn(
                  getTitleClasses(style),
                  "uppercase tracking-tight",
                )}
              >
                <SplitText trigger={false} delay={0.3}>
                  {config.title}
                </SplitText>
              </Heading>
            </div>
          )}
          {config.subtitle && (
            <ScrollReveal delay={0.5}>
              <p
                className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground md:text-base"
                style={getTextStyle(style)}
              >
                {config.subtitle}
              </p>
            </ScrollReveal>
          )}
          {(primaryButton ?? secondaryButton) && (
            <ScrollReveal delay={0.6}>
              <HeroButtons
                primary={primaryButton}
                secondary={secondaryButton}
                className="mt-6 flex flex-wrap items-center gap-4 md:mt-10"
              />
            </ScrollReveal>
          )}
        </Container>
      </section>
    );
  }

  // =========================================================================
  // Split: 2-column layout (text left, image right)
  // =========================================================================
  if (variant === "split") {
    return (
      <section
        ref={sectionRef}
        data-hero=""
        className={cn(
          "relative overflow-hidden pt-[var(--header-height)]",
          heightClass,
        )}
        style={customHeightStyle}
      >
        <div
          ref={contentRef}
          className="relative z-10 mx-auto flex min-h-full max-w-6xl flex-col items-center px-[var(--container-padding)] md:flex-row"
        >
          <div className="flex flex-1 flex-col justify-center py-12 md:py-0 md:pr-12">
            {config.title && (
              <div style={getTitleStyle(style)}>
                <Heading
                  level={1}
                  className={cn(
                    getTitleClasses(style),
                    "leading-tight tracking-tight",
                  )}
                >
                  <SplitText trigger={false} delay={0.3}>
                    {config.title}
                  </SplitText>
                </Heading>
              </div>
            )}
            {config.subtitle && (
              <ScrollReveal delay={0.2}>
                <p
                  className="mt-4 max-w-lg text-sm leading-relaxed text-muted-foreground md:mt-6 md:text-base"
                  style={getTextStyle(style)}
                >
                  {config.subtitle}
                </p>
              </ScrollReveal>
            )}
            {(primaryButton ?? secondaryButton) && (
              <ScrollReveal delay={0.3}>
                <HeroButtons
                  primary={primaryButton}
                  secondary={secondaryButton}
                  className="mt-6 flex flex-wrap items-center gap-4 md:mt-10"
                />
              </ScrollReveal>
            )}
          </div>
          {config.backgroundImageUrl && (
            <div className="relative flex-1">
              <div className="relative aspect-[4/5] w-full overflow-hidden">
                <Image
                  src={config.backgroundImageUrl}
                  alt=""
                  fill
                  sizes="50vw"
                  className="object-cover"
                  priority
                />
              </div>
            </div>
          )}
        </div>
      </section>
    );
  }

  // =========================================================================
  // Default / Parallax / Video: centered with background
  // =========================================================================
  const useVideo = variant === "video" && config.videoUrl;

  return (
    <section
      ref={sectionRef}
      data-hero=""
      className={cn(
        "relative flex items-center justify-center overflow-hidden pt-[var(--header-height)]",
        heightClass,
      )}
      style={customHeightStyle}
    >
      {/* Background image or video */}
      {useVideo ? (
        <video
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 h-full w-full object-cover"
        >
          <source src={config.videoUrl} />
        </video>
      ) : config.backgroundImageUrl ? (
        <div className="absolute inset-0">
          <div ref={imageRef} className="relative h-full w-full">
            <Image
              src={config.backgroundImageUrl}
              alt=""
              fill
              sizes="100vw"
              className="object-cover"
              priority
            />
          </div>
        </div>
      ) : null}

      {/* Overlay */}
      {config.overlay && (
        <div
          className="absolute inset-0 bg-background"
          style={{ opacity: config.overlayOpacity / 100 }}
          aria-hidden="true"
        />
      )}

      {/* Content */}
      <div
        ref={contentRef}
        className="relative z-10 px-[var(--container-padding)] text-center"
      >
        {config.title && (
          <div style={getTitleStyle(style)}>
            <Heading
              level={1}
              className={cn(
                getTitleClasses(style),
                "leading-tight tracking-tight",
              )}
            >
              <SplitText trigger={false} delay={0.3}>
                {config.title}
              </SplitText>
            </Heading>
          </div>
        )}

        {config.subtitle && (
          <ScrollReveal delay={0.2}>
            <p
              className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-muted-foreground md:mt-6 md:text-base"
              style={getTextStyle(style)}
            >
              {config.subtitle}
            </p>
          </ScrollReveal>
        )}

        {(primaryButton ?? secondaryButton) && (
          <ScrollReveal delay={0.3}>
            <HeroButtons
              primary={primaryButton}
              secondary={secondaryButton}
              className="mt-6 flex flex-col items-center gap-4 md:mt-10"
            />
          </ScrollReveal>
        )}
      </div>
    </section>
  );
}

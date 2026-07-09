"use client";

/**
 * StandardHeroSection — Generic hero with height/overlay/CTA variants
 *
 * Configurable height, background media (image OR video) overlay, SplitText title,
 * and CTA buttons via MagneticButton + text link.
 *
 * `minimal` variant is the DB-driven mini hero used by all system pages:
 * bottom-aligned, gradient background, left-aligned text, chars animation.
 *
 * `default` variant without a background automatically delegates to the minimal
 * layout for visual consistency.
 *
 * 2026-05-24 PR (MediaPicker Phase 8): `backgroundImage` (image-only) + `video`
 * (video-only) を `backgroundMedia` (image OR video) 単一フィールドに統合。
 * 公開側は `detectMediaSourceType()` で runtime に image / video を派生して
 * `<Image>` / `<VideoPlayer>` を出し分ける（業界標準 WordPress Cover Block
 * パターン）。`variant="video"` も撤廃 — メディア URL 自体が動画なら自動的に
 * 動画として描画される。
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
import { SectionLabel } from "@/public/components/ui/SectionLabel";
import {
  DURATION,
  EASE,
  REVEAL,
  SCROLL_TRIGGER,
} from "@/public/lib/animations";
import type { HeroConfig } from "@/shared/lib/validations/section";
import type { SectionStylePayload } from "@/shared/domain/section-styles/types";
import { toAppRoute } from "@/shared/lib/typed-routes";
import { spansToPlainText } from "@/shared/lib/portable-text";
import { PortableTextSpans } from "@/shared/components/portable-text/PortableTextSpans";
import { PortableText } from "@/shared/components/portable-text/PortableText";
import { detectMediaSourceType } from "@/shared/lib/media/detect-media-type";
import { HeroBackgroundSlideshow } from "@/public/components/page-hero/hero-background-slideshow";
import {
  HeroScrim,
  getHeroTextClasses,
} from "@/public/components/page-hero/hero-scrim";
import {
  getTitleStyle,
  getTextStyle,
} from "@/public/components/sections/section-style-helpers";

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
          label={primary.label}
          {...(primary.backgroundColor && {
            customBackgroundColor: primary.backgroundColor,
          })}
          {...(primary.textColor && { customTextColor: primary.textColor })}
          openInNewTab={primary.openInNewTab}
        />
      )}
      {secondary && (
        <Link
          href={toAppRoute(secondary.url)}
          className="group relative inline-block text-xs uppercase tracking-eyebrow text-muted-foreground transition-colors hover:text-foreground"
          {...(secondary.openInNewTab && {
            target: "_blank" as const,
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
          {spansToPlainText(secondary.label)}
          {secondary.openInNewTab && (
            <span className="sr-only">（新しいタブで開く）</span>
          )}
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
  const mediaItems = config.backgroundMedia;
  const hasMedia = mediaItems.length > 0;
  const firstItem = mediaItems[0];
  const isSingleImage =
    mediaItems.length === 1 &&
    firstItem !== undefined &&
    detectMediaSourceType(firstItem.url) === "image";

  // minimal layout: explicit minimal OR default without background
  const useMinimalLayout =
    variant === "minimal" || (variant === "default" && !hasMedia);

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

        // Parallax background when variant is 'parallax' AND media is an image
        const image = imageRef.current;
        const section = sectionRef.current;
        if (!image || !section) return;
        if (variant !== "parallax" || !isSingleImage) return;

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

  const text = getHeroTextClasses(config.scrimTone);

  const isCustomHeight = config.height === "custom";
  const heightClass = isCustomHeight
    ? undefined
    : (HEIGHT_MAP[config.height] ?? HEIGHT_MAP["md"]);
  const customHeightStyle = isCustomHeight
    ? { minHeight: `${String(config.heightCustom ?? 60)}svh` }
    : undefined;
  const primaryButton = config.buttons.find((b) => b.variant === "primary");
  const secondaryButton = config.buttons.find((b) => b.variant === "secondary");
  const hasTitle = config.title.length > 0;
  const hasSubtitle = config.subtitle.length > 0;
  const hasButtons = Boolean(primaryButton ?? secondaryButton);
  const hasOtherContent = hasTitle || hasSubtitle || hasButtons;
  const showSectionLabel = Boolean(config.sectionLabel) && hasOtherContent;

  // =========================================================================
  // Minimal: bottom-aligned, solid background, center-aligned
  // Used by system pages (DB-driven hero sections)
  //
  // 旧 `bg-gradient-to-b from-surface via-background to-background` 廃止。
  // axe-core が gradient ancestor を bgGradient incomplete で評価できず、
  // production build で violation に昇格する silent bug の root cause。
  // 代替は solid `bg-background` (body bg と同色)。
  // =========================================================================
  if (useMinimalLayout) {
    return (
      <section
        ref={sectionRef}
        data-hero=""
        className="relative flex items-end overflow-hidden bg-background pt-[calc(var(--hero-header-offset)+1rem)] md:pt-[calc(var(--hero-header-offset)+1.5rem)]"
      >
        <Container className="relative w-full !max-w-6xl text-center">
          {showSectionLabel && (
            <ScrollReveal delay={0.15}>
              <SectionLabel>{config.sectionLabel}</SectionLabel>
            </ScrollReveal>
          )}
          {hasTitle && (
            <div
              className={cn(showSectionLabel && "mt-4")}
              style={getTitleStyle(style)}
            >
              <Heading
                level={1}
                className={cn("text-page-hero tracking-tight")}
              >
                <SplitText trigger={false} delay={0.3}>
                  <PortableTextSpans spans={config.title} />
                </SplitText>
              </Heading>
            </div>
          )}
          {hasSubtitle && (
            <ScrollReveal delay={0.5}>
              <div
                className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-muted-foreground md:text-base [&_p]:mt-0 [&_p+p]:mt-3"
                style={getTextStyle(style)}
              >
                <PortableText blocks={config.subtitle} />
              </div>
            </ScrollReveal>
          )}
          {(primaryButton ?? secondaryButton) && (
            <ScrollReveal delay={0.6}>
              <HeroButtons
                primary={primaryButton}
                secondary={secondaryButton}
                className="mt-6 flex flex-wrap items-center justify-center gap-4 md:mt-10"
              />
            </ScrollReveal>
          )}
        </Container>
      </section>
    );
  }

  // =========================================================================
  // Split: 2-column layout (text left, media right)
  // =========================================================================
  if (variant === "split") {
    return (
      <section
        ref={sectionRef}
        data-hero=""
        className={cn(
          "relative overflow-hidden pt-[var(--hero-header-offset)]",
          heightClass,
        )}
        style={customHeightStyle}
      >
        <div
          ref={contentRef}
          className="relative z-10 mx-auto flex min-h-full max-w-6xl flex-col items-center ps-[var(--container-padding-start)] pe-[var(--container-padding-end)] md:flex-row"
        >
          <div className="flex flex-1 flex-col justify-center py-12 md:py-0 md:pr-12">
            {showSectionLabel && (
              <ScrollReveal delay={0.15}>
                <SectionLabel>{config.sectionLabel}</SectionLabel>
              </ScrollReveal>
            )}
            {hasTitle && (
              <div
                className={cn(showSectionLabel && "mt-4")}
                style={getTitleStyle(style)}
              >
                <Heading
                  level={1}
                  className={cn("text-page-hero leading-tight tracking-tight")}
                >
                  <SplitText trigger={false} delay={0.3}>
                    <PortableTextSpans spans={config.title} />
                  </SplitText>
                </Heading>
              </div>
            )}
            {hasSubtitle && (
              <ScrollReveal delay={0.2}>
                <div
                  className="mt-4 max-w-lg text-sm leading-relaxed text-muted-foreground md:mt-6 md:text-base [&_p]:mt-0 [&_p+p]:mt-3"
                  style={getTextStyle(style)}
                >
                  <PortableText blocks={config.subtitle} />
                </div>
              </ScrollReveal>
            )}
            {hasButtons && (
              <ScrollReveal delay={0.3}>
                <HeroButtons
                  primary={primaryButton}
                  secondary={secondaryButton}
                  className="mt-6 flex flex-wrap items-center gap-4 md:mt-10"
                />
              </ScrollReveal>
            )}
          </div>
          {hasMedia && (
            <div className="relative flex-1">
              <div className="relative aspect-[4/5] w-full overflow-hidden">
                <HeroBackgroundSlideshow
                  items={mediaItems}
                  transition={config.transition}
                  autoPlayInterval={config.autoPlayInterval}
                  sizes="50vw"
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
  // Default / Parallax: centered with background media (image or video)
  // =========================================================================
  return (
    <section
      ref={sectionRef}
      data-hero=""
      className={cn(
        "relative flex items-center justify-center overflow-hidden pt-[var(--hero-header-offset)]",
        heightClass,
      )}
      style={customHeightStyle}
    >
      {/* Background media: 単一画像 + parallax は scrub、それ以外はスライドショー */}
      {hasMedia &&
        (variant === "parallax" && isSingleImage && firstItem ? (
          <div className="absolute inset-0">
            <div ref={imageRef} className="relative h-full w-full">
              <Image
                src={firstItem.url}
                alt={firstItem.alt}
                fill
                sizes="100vw"
                className="object-cover"
                loading="eager"
                fetchPriority="high"
              />
            </div>
          </div>
        ) : (
          <HeroBackgroundSlideshow
            items={mediaItems}
            transition={config.transition}
            autoPlayInterval={config.autoPlayInterval}
            sizes="100vw"
            priority
          />
        ))}

      {/* Readability scrim */}
      <HeroScrim
        enabled={config.scrimEnabled}
        tone={config.scrimTone}
        opacity={config.scrimOpacity}
      />

      {/* Content */}
      <div
        ref={contentRef}
        className={cn(
          "relative z-10 ps-[var(--container-padding-start)] pe-[var(--container-padding-end)] text-center",
          text.base,
        )}
      >
        {showSectionLabel && (
          <ScrollReveal delay={0.15}>
            <SectionLabel>{config.sectionLabel}</SectionLabel>
          </ScrollReveal>
        )}
        {hasTitle && (
          <div
            className={cn(showSectionLabel && "mt-4")}
            style={getTitleStyle(style)}
          >
            <Heading
              level={1}
              className={cn(
                "text-page-hero leading-tight tracking-tight",
                text.title,
              )}
            >
              <SplitText trigger={false} delay={0.3}>
                <PortableTextSpans spans={config.title} />
              </SplitText>
            </Heading>
          </div>
        )}

        {hasSubtitle && (
          <ScrollReveal delay={0.2}>
            <div
              className={cn(
                "mx-auto mt-4 max-w-lg text-sm leading-relaxed md:mt-6 md:text-base",
                "[&_p]:mt-0 [&_p+p]:mt-3",
                text.subtitle,
              )}
              style={getTextStyle(style)}
            >
              <PortableText blocks={config.subtitle} />
            </div>
          </ScrollReveal>
        )}

        {hasButtons && (
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

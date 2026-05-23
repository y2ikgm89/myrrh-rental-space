"use client";

/**
 * VideoHero — page-hero variant=video
 *
 * 全面背景動画 + センター寄せ overlay テキスト（業界 reference: Apple Hero /
 * Squarespace Video Backgrounds / Webflow Background Video）。
 *
 * - 背景動画は `VideoPlayer variant="background"` (auto-play + loop + mute + コントロール非表示)
 * - 動画 URL は R2 self-host mp4 / YouTube / Vimeo を `detectVideoProvider()` で自動 dispatch
 * - posterImage は動画 load 中 / autoplay 失敗時のフォールバック（モバイル iOS Safari 等）
 * - overlay は WCAG 1.4.3 のテキスト可読性確保用（管理画面で disable も可能）
 * - 入場アニメーションは GSAP matchMedia pattern A-1（prefers-reduced-motion 自動 skip）
 */

import { useRef, type ReactElement } from "react";
import Image from "next/image";
import { useGSAP } from "@gsap/react";
import { gsap } from "@/public/lib/gsap-config";
import { Button } from "@/public/components/design-system/button";
import { VideoPlayer } from "@/public/components/design-system/video-player";
import { SplitText } from "@/public/components/animations/split-text";
import { ScrollReveal } from "@/public/components/animations/scroll-reveal";
import { DURATION, EASE, REVEAL } from "@/public/lib/animations";
import { cn } from "@/shared/lib/cn";
import { isAppRoute } from "@/shared/lib/typed-routes";
import type { PageHeroConfig } from "@/shared/lib/sections/definitions/page-hero";
import { PortableTextSpans } from "@/shared/components/portable-text/PortableTextSpans";
import { PortableText } from "@/shared/components/portable-text/PortableText";

export type VideoHeroProps = Omit<
  Extract<PageHeroConfig, { variant: "video" }>,
  "variant" | "layout"
>;

export function VideoHero({
  label,
  title,
  description,
  video,
  posterImage,
  overlay,
  overlayOpacity,
  buttons,
}: VideoHeroProps): ReactElement {
  const sectionRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const hasVideo = video.length > 0;
  const hasPoster = posterImage.url.length > 0;
  const hasLabel = label.length > 0;
  const hasTitle = title.length > 0;
  const hasDescription = description.length > 0;
  const hasButtons = buttons.length > 0;

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
    { scope: sectionRef },
  );

  return (
    <section
      ref={sectionRef}
      data-hero=""
      className={cn(
        "relative flex items-center justify-center overflow-hidden bg-foreground",
        "min-h-[var(--hero-min-height)] md:min-h-[var(--hero-min-height-lg)]",
        "pt-[var(--header-height)]",
      )}
    >
      {/* Background: video > poster image > solid foreground fallback */}
      {hasVideo ? (
        <div className="absolute inset-0">
          {hasPoster ? (
            <Image
              src={posterImage.url}
              alt={posterImage.alt}
              fill
              sizes="100vw"
              className="object-cover"
              priority
            />
          ) : null}
          <div className="absolute inset-0">
            <VideoPlayer
              url={video}
              variant="background"
              {...(hasPoster && { poster: posterImage.url })}
            />
          </div>
        </div>
      ) : hasPoster ? (
        <div className="absolute inset-0">
          <Image
            src={posterImage.url}
            alt={posterImage.alt}
            fill
            sizes="100vw"
            className="object-cover"
            priority
          />
        </div>
      ) : null}

      {/* Readability overlay (WCAG 1.4.3) */}
      {overlay && (
        <div
          className="absolute inset-0 bg-foreground"
          style={{ opacity: overlayOpacity / 100 }}
          aria-hidden="true"
        />
      )}

      {/* Content */}
      <div
        ref={contentRef}
        className={cn(
          "relative z-10 mx-auto max-w-3xl text-center text-background",
          "ps-[var(--container-padding-start)] pe-[var(--container-padding-end)]",
          "py-[var(--space-lg)]",
        )}
      >
        {hasLabel && (
          <p
            className={cn(
              "mb-6 text-[0.75rem] uppercase tracking-[0.18em] text-background",
              "[paint-order:stroke_fill]",
              "[-webkit-text-stroke:0.4px_rgb(0_0_0/0.4)]",
              "[text-shadow:0_1px_3px_rgb(0_0_0/0.55)]",
            )}
          >
            <PortableTextSpans spans={label} />
          </p>
        )}

        {hasTitle && (
          <h1
            className={cn(
              "font-heading font-light leading-[1.1] tracking-tight",
              "text-[clamp(2.5rem,7vw,4.5rem)] text-background",
              "[paint-order:stroke_fill]",
              "[-webkit-text-stroke:0.5px_rgb(0_0_0/0.45)]",
              "[text-shadow:0_1px_2px_rgb(0_0_0/0.6),0_2px_12px_rgb(0_0_0/0.5)]",
            )}
          >
            <SplitText trigger={false} delay={0.5}>
              <PortableTextSpans spans={title} />
            </SplitText>
          </h1>
        )}

        {hasDescription && (
          <ScrollReveal delay={0.4}>
            <div
              className={cn(
                "mx-auto mt-6 max-w-xl text-sm leading-relaxed text-background/90 md:text-base",
                "[&_p]:mt-0 [&_p+p]:mt-3",
                "[paint-order:stroke_fill]",
                "[-webkit-text-stroke:0.3px_rgb(0_0_0/0.35)]",
                "[text-shadow:0_1px_2px_rgb(0_0_0/0.55)]",
              )}
            >
              <PortableText blocks={description} />
            </div>
          </ScrollReveal>
        )}

        {hasButtons && (
          <ScrollReveal delay={0.5}>
            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center sm:gap-4 md:mt-10">
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

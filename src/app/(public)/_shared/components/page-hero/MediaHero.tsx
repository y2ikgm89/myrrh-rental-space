"use client";

/**
 * MediaHero — page-hero variant=media
 *
 * 全面背景メディア（画像 OR 動画）+ センター寄せ overlay テキスト。
 * 業界 reference: WordPress Cover Block / Apple Hero / Squarespace Video Backgrounds /
 * Webflow Background Video。`media.url` が動画なら VideoPlayer Primitive で auto-play +
 * loop + mute、画像なら next/image で表示する（`detectMediaSourceType()` で runtime 判別）。
 *
 * - 動画選択時: VideoPlayer (R2 mp4 / YouTube / Vimeo を `detectVideoProvider()` で auto dispatch)
 *   + posterImage を load 中 / autoplay 失敗時の fallback（モバイル iOS Safari 等）として表示
 * - 画像選択時: next/image で背景 fill
 * - overlay は WCAG 1.4.3 のテキスト可読性確保用（管理画面で disable も可能）
 * - 入場アニメーションは GSAP matchMedia pattern A-1（prefers-reduced-motion 自動 skip）
 *
 * 2026-05-24 PR (MediaPicker Phase 8): 旧 VideoHero.tsx を破壊的に置換。`video` フィールド
 * と `backgroundImage` の 2 軸分離を `media` 単一フィールド + runtime discriminate に統合。
 */

import { useRef, type ReactElement } from "react";
import Image from "next/image";
import { useGSAP } from "@gsap/react";
import { gsap } from "@/public/lib/gsap-config";
import { Button } from "@/public/components/design-system/button";
import { SplitText } from "@/public/components/animations/split-text";
import { ScrollReveal } from "@/public/components/animations/scroll-reveal";
import { DURATION, EASE, REVEAL } from "@/public/lib/animations";
import { cn } from "@/shared/lib/cn";
import { isAppRoute } from "@/shared/lib/typed-routes";
import type { PageHeroConfig } from "@/shared/lib/sections/definitions/page-hero";
import { PortableTextSpans } from "@/shared/components/portable-text/PortableTextSpans";
import { PortableText } from "@/shared/components/portable-text/PortableText";
import { HeroBackgroundSlideshow } from "./hero-background-slideshow";
import { HeroScrim, getHeroTextClasses } from "./hero-scrim";

export type MediaHeroProps = Omit<
  Extract<PageHeroConfig, { variant: "media" }>,
  "variant" | "layout"
>;

export function MediaHero({
  label,
  title,
  description,
  media,
  transition,
  autoPlayInterval,
  posterImage,
  scrimEnabled,
  scrimTone,
  scrimOpacity,
  buttons,
}: MediaHeroProps): ReactElement {
  const text = getHeroTextClasses(scrimTone);
  const sectionRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  const hasMedia = media.length > 0;
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
        "pt-[var(--hero-header-offset)]",
      )}
    >
      {/* Background: メディアあればスライドショー、なければ poster / solid fallback */}
      {hasMedia ? (
        <HeroBackgroundSlideshow
          items={media}
          transition={transition}
          autoPlayInterval={autoPlayInterval}
          sizes="100vw"
          priority
          {...(hasPoster && { posterUrl: posterImage.url })}
        />
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

      {/* Readability scrim (WCAG 1.4.3) */}
      <HeroScrim
        enabled={scrimEnabled}
        tone={scrimTone}
        opacity={scrimOpacity}
      />

      {/* Content */}
      <div
        ref={contentRef}
        className={cn(
          "relative z-10 mx-auto max-w-3xl text-center",
          text.base,
          "ps-[var(--container-padding-start)] pe-[var(--container-padding-end)]",
          "py-[var(--spacing-fluid-lg)]",
        )}
      >
        {hasLabel && (
          <p className={cn("mb-6 text-eyebrow-lg uppercase", text.label)}>
            <PortableTextSpans spans={label} />
          </p>
        )}

        {hasTitle && (
          <h1
            className={cn(
              "font-heading font-light leading-[1.1] tracking-tight",
              "text-[clamp(2.5rem,7vw,4.5rem)]",
              text.title,
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
                "mx-auto mt-6 max-w-xl text-sm leading-relaxed md:text-base",
                "[&_p]:mt-0 [&_p+p]:mt-3",
                text.subtitle,
              )}
            >
              <PortableText blocks={description} />
            </div>
          </ScrollReveal>
        )}

        {hasButtons && (
          <ScrollReveal delay={0.5}>
            <div className="mx-auto mt-8 grid w-full max-w-sm grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 md:mt-10">
              {buttons.map((btn) => (
                <Button
                  key={btn.url}
                  variant="editorial"
                  href={isAppRoute(btn.url) ? btn.url : "/reservation"}
                  className="min-h-[var(--touch-target-min)] w-full justify-center text-xs uppercase tracking-eyebrow"
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

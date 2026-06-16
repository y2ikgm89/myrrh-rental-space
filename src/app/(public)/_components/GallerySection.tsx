"use client";

/**
 * GallerySection — Image gallery with grid/masonry/carousel layout
 *
 * CSS grid for standard, CSS columns for masonry, scroll-snap for carousel.
 * Lightbox via native <dialog> element. useGSAP stagger reveal.
 */

import { useEffect, useRef, useState, type ReactElement } from "react";
import Image from "next/image";
import { IconChevronLeft, IconChevronRight, IconX } from "@tabler/icons-react";
import { cn } from "@/shared/lib/cn";
import { useGSAP } from "@gsap/react";
import { gsap } from "@/public/lib/gsap-config";
import { ScrollReveal } from "@/public/components/animations/scroll-reveal";
import { SplitText } from "@/public/components/animations/split-text";
import { SectionWrapper } from "@/public/components/sections/SectionWrapper";
import {
  getTitleClasses,
  getTitleStyle,
  getTextStyle,
} from "@/public/components/sections/section-style-helpers";
import { SectionLabel } from "@/public/components/ui/SectionLabel";
import { Heading } from "@/public/components/design-system/heading";
import { VideoPlayer } from "@/public/components/design-system/video-player";
import { detectMediaSourceType } from "@/shared/lib/media/detect-media-type";
import { DURATION, EASE, STAGGER } from "@/public/lib/animations";
import {
  IMAGE_ASPECT_MAP,
  GALLERY_GAP_MAP,
  GALLERY_HOVER_EFFECT_MAP,
  getGalleryGridColsClass,
  getMasonryColsClass,
} from "@/public/lib/section-style-maps";
import {
  parseGalleryImageAspect,
  parseGalleryHoverEffect,
} from "@/shared/lib/validations/section-parsers";
import type { GalleryConfig } from "@/shared/lib/validations/section";
import type { SectionStylePayload } from "@/shared/domain/section-styles/types";
import { PortableTextSpans } from "@/shared/components/portable-text/PortableTextSpans";

interface GallerySectionProps {
  readonly config: GalleryConfig;
  readonly style: SectionStylePayload;
}

export function GallerySection({
  config,
  style,
}: GallerySectionProps): ReactElement {
  const gridRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const touchStartXRef = useRef<number | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState(-1);
  const isLightboxOpen = lightboxIndex >= 0;

  // iOS Safari は <dialog> 表示中も背後 body がスクロールできてしまう（WebKit）。
  // position:fixed 方式で body をロックし、閉じたら元のスクロール位置に復帰する。
  useEffect(() => {
    if (!isLightboxOpen) return;
    const scrollY = window.scrollY;
    const body = document.body;
    const prev = {
      position: body.style.position,
      top: body.style.top,
      width: body.style.width,
      overflow: body.style.overflow,
    };
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.width = "100%";
    body.style.overflow = "hidden";
    return () => {
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.width = prev.width;
      body.style.overflow = prev.overflow;
      window.scrollTo(0, scrollY);
    };
  }, [isLightboxOpen]);

  useGSAP(
    () => {
      const grid = gridRef.current;
      if (!grid) return;

      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const items = grid.querySelectorAll("[data-gallery-item]");
        if (items.length === 0) return;

        gsap.fromTo(
          items,
          { y: 30, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: DURATION.slow,
            ease: EASE.outQuart,
            stagger: STAGGER.card * 0.6,
            scrollTrigger: {
              trigger: grid,
              start: "top 85%",
              toggleActions: "play none none none",
            },
          },
        );
      });
    },
    { scope: gridRef },
  );

  const openLightbox = (imageIndex: number) => {
    if (!config.enableLightbox) return;
    setLightboxIndex(imageIndex);
    dialogRef.current?.showModal();
  };

  const closeLightbox = () => {
    dialogRef.current?.close();
    setLightboxIndex(-1);
  };

  // lightbox は画像のみを対象にする（動画はインライン再生）
  const imageItems = config.media.filter(
    (m) => detectMediaSourceType(m.url) !== "video",
  );

  const navigateLightbox = (direction: 1 | -1) => {
    setLightboxIndex((prev) => {
      const next = prev + direction;
      if (next < 0) return imageItems.length - 1;
      if (next >= imageItems.length) return 0;
      return next;
    });
  };

  // キーボード（←/→）での画像送り。Escape は native <dialog> が処理。
  const handleLightboxKeyDown = (e: React.KeyboardEvent<HTMLDialogElement>) => {
    if (imageItems.length <= 1) return;
    if (e.key === "ArrowLeft") navigateLightbox(-1);
    else if (e.key === "ArrowRight") navigateLightbox(1);
  };

  // タッチスワイプでの画像送り（モバイルの主操作）。
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0]?.clientX ?? null;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartXRef.current === null || imageItems.length <= 1) return;
    const dx = (e.changedTouches[0]?.clientX ?? 0) - touchStartXRef.current;
    if (Math.abs(dx) > 50) navigateLightbox(dx < 0 ? 1 : -1);
    touchStartXRef.current = null;
  };

  if (config.media.length === 0) return <></>;

  const gapClass = GALLERY_GAP_MAP[config.gap] ?? GALLERY_GAP_MAP.md;
  const colKey = Math.min(Math.max(config.columns, 1), 6);

  const isMasonry = config.gridLayout === "masonry";
  const isCarousel = config.gridLayout === "carousel";

  const imageAspect = parseGalleryImageAspect(config.imageAspect);
  const aspectClass = IMAGE_ASPECT_MAP[imageAspect];
  const hoverEffect = parseGalleryHoverEffect(config.hoverEffect);
  const hoverClasses = GALLERY_HOVER_EFFECT_MAP[hoverEffect];

  const layoutClass = isCarousel
    ? "flex gap-4 overflow-x-auto snap-x snap-mandatory scroll-smooth pb-4 -mx-5 px-5 md:-mx-8 md:px-8"
    : isMasonry
      ? cn(getMasonryColsClass(colKey), gapClass)
      : cn("@container grid", getGalleryGridColsClass(colKey), gapClass);

  const lightboxImage =
    lightboxIndex >= 0 && lightboxIndex < imageItems.length
      ? imageItems[lightboxIndex]
      : undefined;

  return (
    <SectionWrapper style={style} layout={config.layout}>
      {config.title.length > 0 && (
        <div className="mb-10 text-center md:mb-14">
          {config.sectionLabel && (
            <ScrollReveal>
              <SectionLabel>{config.sectionLabel}</SectionLabel>
            </ScrollReveal>
          )}
          <div style={getTitleStyle(style)}>
            <Heading
              level={2}
              className={cn("mt-4 tracking-tight", getTitleClasses(style))}
            >
              <SplitText>
                <PortableTextSpans spans={config.title} />
              </SplitText>
            </Heading>
          </div>
        </div>
      )}

      <div ref={gridRef} className={layoutClass}>
        {config.media.map((item) => {
          const isVideo = detectMediaSourceType(item.url) === "video";
          // lightbox の index は画像サブセット内の位置
          const imageIndex = isVideo
            ? -1
            : imageItems.findIndex((m) => m.url === item.url);
          return (
            <div
              key={item.url}
              data-gallery-item=""
              className={cn(
                hoverClasses.wrapper,
                isCarousel && "min-w-[280px] snap-center md:min-w-[320px]",
                isMasonry && "mb-4 break-inside-avoid",
              )}
            >
              {isVideo ? (
                <div
                  className={cn(
                    "relative block w-full overflow-hidden",
                    aspectClass,
                  )}
                >
                  <VideoPlayer
                    url={item.url}
                    variant="controls"
                    {...(item.alt.length > 0 && { title: item.alt })}
                    className="h-full w-full"
                  />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => openLightbox(imageIndex)}
                  className={cn(
                    "relative block w-full overflow-hidden",
                    aspectClass,
                  )}
                  disabled={!config.enableLightbox}
                  aria-label={
                    item.alt.length > 0 ? item.alt : "ギャラリー画像を拡大表示"
                  }
                >
                  <Image
                    src={item.url}
                    alt={item.alt}
                    width={600}
                    height={400}
                    className={cn(
                      "h-full w-full object-cover transition-transform duration-500",
                      hoverEffect === "zoom" && "group-hover:scale-105",
                    )}
                    sizes={`(max-width: 768px) 100vw, ${Math.round(100 / colKey)}vw`}
                  />
                  {hoverClasses.overlay && (
                    <div
                      className={cn(
                        "absolute inset-0 bg-foreground/20",
                        hoverClasses.overlay,
                      )}
                    />
                  )}
                </button>
              )}
              {item.caption.length > 0 && (
                <p
                  className="mt-2 text-xs text-muted-foreground"
                  style={getTextStyle(style)}
                >
                  {item.caption}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Lightbox */}
      {config.enableLightbox && (
        <dialog
          ref={dialogRef}
          className="fixed inset-0 z-50 m-0 h-full w-full max-h-full max-w-full overscroll-contain bg-background/95 backdrop:bg-background/80"
          onClick={(e) => {
            if (e.target === dialogRef.current) closeLightbox();
          }}
          onKeyDown={handleLightboxKeyDown}
        >
          {lightboxImage && (
            <div className="relative flex h-full w-full flex-col items-center justify-center p-4">
              <button
                type="button"
                onClick={closeLightbox}
                className="absolute right-4 top-4 z-10 inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface/80 text-muted-foreground transition-colors duration-200 hover:border-foreground/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                aria-label="閉じる"
              >
                <IconX
                  className="h-5 w-5"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
              </button>

              {/* 前/次ナビは画面内端に配置（旧 -left-14/-right-14 はモバイルで画面外）。
                  複数画像のときのみ表示し、タッチはスワイプ・キーボードは ←/→ でも送れる。 */}
              {imageItems.length > 1 && (
                <button
                  type="button"
                  onClick={() => navigateLightbox(-1)}
                  className="absolute left-2 top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-surface/80 text-muted-foreground transition-colors duration-200 hover:border-foreground/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  aria-label="前の画像"
                >
                  <IconChevronLeft
                    className="h-5 w-5"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                </button>
              )}

              <div
                className="flex max-h-[80svh] max-w-[90vw] items-center"
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
              >
                <Image
                  src={lightboxImage.url}
                  alt={lightboxImage.alt}
                  width={1200}
                  height={800}
                  sizes="90vw"
                  className="max-h-[80svh] w-auto object-contain"
                />
              </div>

              {imageItems.length > 1 && (
                <button
                  type="button"
                  onClick={() => navigateLightbox(1)}
                  className="absolute right-2 top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-surface/80 text-muted-foreground transition-colors duration-200 hover:border-foreground/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  aria-label="次の画像"
                >
                  <IconChevronRight
                    className="h-5 w-5"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                </button>
              )}

              {lightboxImage.caption.length > 0 && (
                <p className="mt-4 text-center text-sm text-muted-foreground">
                  {lightboxImage.caption}
                </p>
              )}
            </div>
          )}
        </dialog>
      )}
    </SectionWrapper>
  );
}

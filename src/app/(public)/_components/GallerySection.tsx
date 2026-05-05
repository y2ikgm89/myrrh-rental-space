"use client";

/**
 * GallerySection — Image gallery with grid/masonry/carousel layout
 *
 * CSS grid for standard, CSS columns for masonry, scroll-snap for carousel.
 * Lightbox via native <dialog> element. useGSAP stagger reveal.
 */

import { useRef, useState, type ReactElement } from "react";
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
  const [lightboxIndex, setLightboxIndex] = useState(-1);

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

  const openLightbox = (index: number) => {
    if (!config.enableLightbox) return;
    setLightboxIndex(index);
    dialogRef.current?.showModal();
  };

  const closeLightbox = () => {
    dialogRef.current?.close();
    setLightboxIndex(-1);
  };

  const navigateLightbox = (direction: 1 | -1) => {
    setLightboxIndex((prev) => {
      const next = prev + direction;
      if (next < 0) return config.images.length - 1;
      if (next >= config.images.length) return 0;
      return next;
    });
  };

  if (config.images.length === 0) return <></>;

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
    lightboxIndex >= 0 && lightboxIndex < config.images.length
      ? config.images[lightboxIndex]
      : undefined;

  return (
    <SectionWrapper style={style} layout={config.layout}>
      {config.title && (
        <div className="mb-10 text-center md:mb-14">
          <ScrollReveal>
            {config.sectionLabel && (
              <SectionLabel>{config.sectionLabel}</SectionLabel>
            )}
          </ScrollReveal>
          <div style={getTitleStyle(style)}>
            <Heading
              level={2}
              className={cn("mt-4 tracking-tight", getTitleClasses(style))}
            >
              <SplitText>{config.title}</SplitText>
            </Heading>
          </div>
        </div>
      )}

      <div ref={gridRef} className={layoutClass}>
        {config.images.map((image, index) => (
          <div
            key={image.url}
            data-gallery-item=""
            className={cn(
              hoverClasses.wrapper,
              isCarousel && "min-w-[280px] snap-center md:min-w-[320px]",
              isMasonry && "mb-4 break-inside-avoid",
            )}
          >
            <button
              type="button"
              onClick={() => openLightbox(index)}
              className={cn(
                "relative block w-full overflow-hidden",
                aspectClass,
              )}
              disabled={!config.enableLightbox}
              aria-label={image.alt ?? `ギャラリー画像 ${index + 1} を拡大表示`}
            >
              <Image
                src={image.url}
                alt={image.alt ?? ""}
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
            {image.caption && (
              <p
                className="mt-2 text-xs text-muted-foreground"
                style={getTextStyle(style)}
              >
                {image.caption}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Lightbox */}
      {config.enableLightbox && (
        <dialog
          ref={dialogRef}
          className="fixed inset-0 z-50 m-0 h-full w-full max-h-full max-w-full bg-background/95 backdrop:bg-background/80"
          onClick={(e) => {
            if (e.target === dialogRef.current) closeLightbox();
          }}
        >
          {lightboxImage && (
            <div className="flex h-full w-full flex-col items-center justify-center p-4">
              <button
                type="button"
                onClick={closeLightbox}
                className="absolute right-4 top-4 inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface/80 text-muted-foreground transition-colors duration-200 hover:border-foreground/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                aria-label="閉じる"
              >
                <IconX
                  className="h-5 w-5"
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
              </button>

              <div className="relative flex max-h-[80svh] max-w-[90vw] items-center">
                <button
                  type="button"
                  onClick={() => navigateLightbox(-1)}
                  className="absolute -left-14 inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface/80 text-muted-foreground transition-colors duration-200 hover:border-foreground/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  aria-label="前の画像"
                >
                  <IconChevronLeft
                    className="h-5 w-5"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                </button>

                <Image
                  src={lightboxImage.url}
                  alt={lightboxImage.alt ?? ""}
                  width={1200}
                  height={800}
                  className="max-h-[80svh] w-auto object-contain"
                />

                <button
                  type="button"
                  onClick={() => navigateLightbox(1)}
                  className="absolute -right-14 inline-flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface/80 text-muted-foreground transition-colors duration-200 hover:border-foreground/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  aria-label="次の画像"
                >
                  <IconChevronRight
                    className="h-5 w-5"
                    strokeWidth={1.5}
                    aria-hidden="true"
                  />
                </button>
              </div>

              {lightboxImage.caption && (
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

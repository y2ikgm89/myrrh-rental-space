"use client";

/**
 * GallerySection — Image gallery with grid/masonry/carousel layout
 *
 * CSS grid for standard, CSS columns for masonry, scroll-snap for carousel.
 * Lightbox via native <dialog> element. useGSAP stagger reveal.
 */

import { useRef, useState, type ReactElement } from "react";
import Image from "next/image";
import { useGSAP } from "@gsap/react";
import { gsap } from "@/public/lib/gsap-config";
import { ScrollReveal } from "@/public/components/animations/ScrollReveal";
import { SplitText } from "@/public/components/animations/SplitText";
import {
  SectionWrapper,
  getTitleClasses,
  getTitleStyle,
  getTextStyle,
} from "@/public/components/sections/SectionWrapper";
import { SectionLabel } from "@/public/components/ui/SectionLabel";
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
import type { SectionDesign } from "@/shared/lib/validations/section-design";

interface GallerySectionProps {
  readonly config: GalleryConfig;
  readonly design: SectionDesign;
}

export function GallerySection({
  config,
  design,
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

  const isMasonry = config.layout === "masonry";
  const isCarousel = config.layout === "carousel";

  const imageAspect = parseGalleryImageAspect(config.imageAspect);
  const aspectClass = IMAGE_ASPECT_MAP[imageAspect];
  const hoverEffect = parseGalleryHoverEffect(config.hoverEffect);
  const hoverClasses = GALLERY_HOVER_EFFECT_MAP[hoverEffect];

  const layoutClass = isCarousel
    ? `flex gap-4 overflow-x-auto snap-x snap-mandatory scroll-smooth pb-4 -mx-5 px-5 md:-mx-8 md:px-8`
    : isMasonry
      ? `${getMasonryColsClass(colKey)} ${gapClass}`
      : `grid ${getGalleryGridColsClass(colKey)} ${gapClass}`;

  return (
    <SectionWrapper design={design}>
      {config.title && (
        <div className="mb-10 text-center md:mb-14">
          <ScrollReveal>
            {config.sectionLabel && (
              <SectionLabel>{config.sectionLabel}</SectionLabel>
            )}
          </ScrollReveal>
          <h2
            className={`mt-4 font-heading ${getTitleClasses(design)} font-bold tracking-tight`}
            style={getTitleStyle(design)}
          >
            <SplitText variant="words">{config.title}</SplitText>
          </h2>
        </div>
      )}

      <div ref={gridRef} className={layoutClass}>
        {config.images.map((image, index) => (
          <div
            key={image.url}
            data-gallery-item=""
            className={`rounded-lg ${hoverClasses.wrapper} ${
              isCarousel ? "min-w-[280px] snap-center md:min-w-[320px]" : ""
            } ${isMasonry ? "mb-4 break-inside-avoid" : ""}`}
          >
            <button
              type="button"
              onClick={() => openLightbox(index)}
              className={`relative block w-full overflow-hidden ${aspectClass}`}
              disabled={!config.enableLightbox}
              aria-label={image.alt ?? `ギャラリー画像 ${index + 1} を拡大表示`}
            >
              <Image
                src={image.url}
                alt={image.alt ?? ""}
                width={600}
                height={400}
                className={`h-full w-full object-cover transition-transform duration-500 ${hoverEffect === "zoom" ? "group-hover:scale-105" : ""}`}
                sizes={`(max-width: 768px) 100vw, ${Math.round(100 / colKey)}vw`}
              />
              {hoverClasses.overlay && (
                <div
                  className={`absolute inset-0 bg-foreground/20 ${hoverClasses.overlay}`}
                />
              )}
            </button>
            {image.caption && (
              <p
                className="mt-2 text-xs text-muted-foreground"
                style={getTextStyle(design)}
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
          {(() => {
            const lightboxImage =
              lightboxIndex >= 0 && lightboxIndex < config.images.length
                ? config.images[lightboxIndex]
                : undefined;
            if (!lightboxImage) return null;
            return (
              <div className="flex h-full w-full flex-col items-center justify-center p-4">
                <button
                  type="button"
                  onClick={closeLightbox}
                  className="absolute right-4 top-4 text-muted-foreground transition-colors hover:text-foreground"
                  aria-label="閉じる"
                >
                  <svg
                    className="h-8 w-8"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>

                <div className="relative flex max-h-[80vh] max-w-[90vw] items-center">
                  <button
                    type="button"
                    onClick={() => navigateLightbox(-1)}
                    className="absolute -left-12 text-muted-foreground transition-colors hover:text-foreground"
                    aria-label="前の画像"
                  >
                    <svg
                      className="h-8 w-8"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M15 19l-7-7 7-7"
                      />
                    </svg>
                  </button>

                  <Image
                    src={lightboxImage.url}
                    alt={lightboxImage.alt ?? ""}
                    width={1200}
                    height={800}
                    className="max-h-[80vh] w-auto rounded-lg object-contain"
                  />

                  <button
                    type="button"
                    onClick={() => navigateLightbox(1)}
                    className="absolute -right-12 text-muted-foreground transition-colors hover:text-foreground"
                    aria-label="次の画像"
                  >
                    <svg
                      className="h-8 w-8"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </button>
                </div>

                {lightboxImage.caption && (
                  <p className="mt-4 text-center text-sm text-muted-foreground">
                    {lightboxImage.caption}
                  </p>
                )}
              </div>
            );
          })()}
        </dialog>
      )}
    </SectionWrapper>
  );
}

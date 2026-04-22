"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { IconX, IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import { ImageFrame } from "../design-system/image-frame";
import type { KeyboardEvent } from "react";

interface ImageGalleryProps {
  readonly images: readonly string[];
  readonly alt: string;
}

export function ImageGallery({ images, alt }: ImageGalleryProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (images.length === 0) return null;

  const thumbnails = images.slice(1, 5);

  function openLightbox(index: number) {
    setLightboxIndex(index);
  }

  function closeLightbox() {
    setLightboxIndex(null);
  }

  function goNext() {
    if (lightboxIndex === null) return;
    setLightboxIndex((lightboxIndex + 1) % images.length);
  }

  function goPrev() {
    if (lightboxIndex === null) return;
    setLightboxIndex((lightboxIndex - 1 + images.length) % images.length);
  }

  function handleKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") closeLightbox();
    if (e.key === "ArrowRight") goNext();
    if (e.key === "ArrowLeft") goPrev();
  }

  const currentImage =
    lightboxIndex !== null ? images[lightboxIndex] : undefined;

  return (
    <div>
      {/* Main image — ImageFrame Primitive */}
      <button
        type="button"
        onClick={() => openLightbox(0)}
        className="block w-full"
      >
        <ImageFrame
          src={images[0] ?? ""}
          alt={`${alt} 1`}
          fill
          aspect="photo"
          sizes="(min-width: 1280px) 860px, (min-width: 1024px) 60vw, 100vw"
          priority
        />
      </button>

      {/* Thumbnail strip */}
      {thumbnails.length > 0 ? (
        <div className="mt-3 flex gap-2">
          {thumbnails.map((src, i) => (
            <button
              key={`${src}-${String(i)}`}
              type="button"
              onClick={() => openLightbox(i + 1)}
              className="block shrink-0"
            >
              <ImageFrame
                src={src}
                alt={`${alt} ${String(i + 2)}`}
                fill
                className="h-16 w-24 sm:h-20 sm:w-28"
                sizes="112px"
              />
            </button>
          ))}
        </div>
      ) : null}

      {/* Lightbox */}
      {lightboxIndex !== null && currentImage ? (
        <LightboxOverlay
          currentImage={currentImage}
          alt={`${alt} ${String(lightboxIndex + 1)}`}
          hasMultiple={images.length > 1}
          onClose={closeLightbox}
          onPrev={goPrev}
          onNext={goNext}
          onKeyDown={handleKeyDown}
        />
      ) : null}
    </div>
  );
}

function LightboxOverlay({
  currentImage,
  alt,
  hasMultiple,
  onClose,
  onPrev,
  onNext,
  onKeyDown,
}: {
  readonly currentImage: string;
  readonly alt: string;
  readonly hasMultiple: boolean;
  readonly onClose: () => void;
  readonly onPrev: () => void;
  readonly onNext: () => void;
  readonly onKeyDown: (e: KeyboardEvent) => void;
}) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    function handleFocusTrap(e: globalThis.KeyboardEvent) {
      if (e.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = dialog.querySelectorAll<HTMLElement>(
        'button, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", handleFocusTrap);
    return () => document.removeEventListener("keydown", handleFocusTrap);
  }, []);

  return (
    <div
      ref={dialogRef}
      role="dialog"
      aria-label="画像ギャラリー"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-overlay"
      onClick={onClose}
      onKeyDown={onKeyDown}
      tabIndex={-1}
    >
      <div
        className="relative max-h-[var(--lightbox-max-height)] max-w-[var(--lightbox-max-width)]"
        onClick={(e) => e.stopPropagation()}
      >
        <Image
          src={currentImage}
          alt={alt}
          width={1200}
          height={800}
          className="max-h-[var(--lightbox-max-height)] w-auto object-contain"
        />
      </div>
      <button
        ref={closeButtonRef}
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 rounded-full bg-background/80 p-2 text-foreground"
        aria-label="閉じる"
      >
        <IconX className="h-6 w-6" />
      </button>
      {hasMultiple ? (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onPrev();
            }}
            className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-2 text-foreground"
            aria-label="前の画像"
          >
            <IconChevronLeft className="h-6 w-6" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onNext();
            }}
            className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-background/80 p-2 text-foreground"
            aria-label="次の画像"
          >
            <IconChevronRight className="h-6 w-6" />
          </button>
        </>
      ) : null}
    </div>
  );
}

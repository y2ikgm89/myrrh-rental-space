"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { IconX, IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import type { KeyboardEvent } from "react";

interface ImageGalleryProps {
  readonly images: readonly string[];
  readonly alt: string;
}

export function ImageGallery({ images, alt }: ImageGalleryProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (images.length === 0) return null;

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
    <>
      {/* Grid */}
      <div className="grid gap-2 md:grid-cols-[2fr_1fr] md:grid-rows-2">
        {images.slice(0, 5).map((src, i) => (
          <button
            key={src}
            type="button"
            onClick={() => openLightbox(i)}
            className={`relative overflow-hidden ${i === 0 ? "aspect-[16/10] md:row-span-2" : "hidden aspect-[4/3] md:block"}`}
          >
            <Image
              src={src}
              alt={`${alt} ${String(i + 1)}`}
              fill
              sizes={i === 0 ? "(min-width: 768px) 66vw, 100vw" : "33vw"}
              className="object-cover transition-transform duration-300 hover:scale-105"
              priority={i === 0}
            />
          </button>
        ))}
      </div>

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
    </>
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
        className="relative max-h-[90svh] max-w-[90vw]"
        onClick={(e) => e.stopPropagation()}
      >
        <Image
          src={currentImage}
          alt={alt}
          width={1200}
          height={800}
          className="max-h-[90svh] w-auto object-contain"
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

"use client";

import { useState } from "react";
import Image from "next/image";
import * as Dialog from "@radix-ui/react-dialog";
import { IconX, IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import type { KeyboardEvent } from "react";
import { ImageFrame } from "../design-system/image-frame";

interface ImageGalleryProps {
  readonly images: readonly string[];
  readonly alt: string;
}

export function ImageGallery({ images, alt }: ImageGalleryProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const isOpen = lightboxIndex !== null;

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

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "ArrowRight") goNext();
    if (e.key === "ArrowLeft") goPrev();
  }

  const currentImage =
    lightboxIndex !== null ? images[lightboxIndex] : undefined;
  const hasMultiple = images.length > 1;

  return (
    <div>
      {/* Main image */}
      <button
        type="button"
        onClick={() => openLightbox(0)}
        className="block w-full"
        aria-label={`${alt} 1 を拡大表示`}
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
              aria-label={`${alt} ${String(i + 2)} を拡大表示`}
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

      {/* Lightbox — Radix Dialog: focus trap + Escape + focus 復帰 自動 */}
      <Dialog.Root
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) closeLightbox();
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-overlay data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content
            onKeyDown={handleKeyDown}
            className="fixed inset-0 z-50 flex items-center justify-center"
          >
            <Dialog.Title className="sr-only">画像ギャラリー</Dialog.Title>
            <Dialog.Description className="sr-only">
              {alt}（{(lightboxIndex ?? 0) + 1} / {images.length}）。
              矢印キーで前後移動、Escape で閉じる。
            </Dialog.Description>
            {currentImage ? (
              <div className="relative max-h-[var(--lightbox-max-height)] max-w-[var(--lightbox-max-width)]">
                <Image
                  src={currentImage}
                  alt={`${alt} ${String((lightboxIndex ?? 0) + 1)}`}
                  width={1200}
                  height={800}
                  className="max-h-[var(--lightbox-max-height)] w-auto object-contain"
                />
              </div>
            ) : null}
            <Dialog.Close
              className="absolute right-4 top-4 inline-flex h-11 w-11 items-center justify-center rounded-full bg-background/80 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              aria-label="閉じる"
            >
              <IconX className="h-6 w-6" aria-hidden="true" />
            </Dialog.Close>
            {hasMultiple ? (
              <>
                <button
                  type="button"
                  onClick={goPrev}
                  className="absolute left-4 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-background/80 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  aria-label="前の画像"
                >
                  <IconChevronLeft className="h-6 w-6" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={goNext}
                  className="absolute right-4 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-background/80 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  aria-label="次の画像"
                >
                  <IconChevronRight className="h-6 w-6" aria-hidden="true" />
                </button>
              </>
            ) : null}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

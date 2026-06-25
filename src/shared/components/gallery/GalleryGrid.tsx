"use client";

/**
 * GalleryGrid — イベント・スペース詳細ページ向けギャラリーグリッド
 *
 * spec §5.1 + §6.1 に基づくレイアウト:
 * - 0 件: null
 * - 1 件: 1 カラム全幅
 * - 2 件: 2 カラム等幅
 * - 3 件: 3 カラム等幅
 * - 4 件: 2×2 グリッド
 * - 5 件以上: 4 カラム（2 行目以降）、最終表示タイルに "+N" オーバーレイ
 *
 * 動画はインライン再生（native <video> controls）。ライトボックスは画像専用。
 * hero prop を渡すと配列先頭に仮想挿入して描画する（Space 詳細で使用）。
 *
 * @remarks
 * GalleryLightbox は initialIndex を初回マウント時のみ参照するため、
 * key={lightboxIndex} でリマウントして index 変更を反映させる（Task 7 の契約）。
 *
 * @remarks
 * src/shared/ から @/public への import は architecture-boundaries 違反のため、
 * VideoPlayer の代わりに native <video> タグを使用する。
 */

import { useEffect, useRef, useState, type ReactElement } from "react";
import Image from "next/image";
import { cn } from "@/shared/lib/cn";
import { detectMediaSourceType } from "@/shared/lib/media/detect-media-type";
import type { GalleryItem } from "@/shared/lib/validations/gallery";
import { GalleryLightbox } from "./GalleryLightbox";

interface GalleryGridProps {
  readonly items: readonly GalleryItem[];
  readonly hero?: string | null;
  readonly className?: string;
}

export function GalleryGrid({
  items,
  hero,
  className,
}: GalleryGridProps): ReactElement | null {
  const merged: GalleryItem[] = hero
    ? [{ url: hero, alt: "", caption: "" }, ...items]
    : [...items];

  const [lightboxIndex, setLightboxIndex] = useState(-1);
  const isOpen = lightboxIndex >= 0;

  // iOS Safari body-lock: scrollY を GalleryGrid 側で保持することで、
  // key={lightboxIndex} による GalleryLightbox リマウント時の ref 再初期化を回避する。
  // GalleryGrid 自体はリマウントされないため scrollYRef は安定して保持される。
  const scrollYRef = useRef<number>(0);
  useEffect(() => {
    if (!isOpen) return;
    scrollYRef.current = window.scrollY;
    const scrollY = scrollYRef.current;
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
  }, [isOpen]);

  if (merged.length === 0) return null;

  // 画像のみ lightbox に流す（spec §6.3: 動画はインライン再生）
  const imageItems = merged.filter(
    (item) => detectMediaSourceType(item.url) !== "video",
  );

  // Layout rules (spec §6.1)
  let displayLimit: number;
  let gridClasses: string;
  if (merged.length === 1) {
    displayLimit = 1;
    gridClasses = "grid grid-cols-1";
  } else if (merged.length === 2) {
    displayLimit = 2;
    gridClasses = "grid grid-cols-2";
  } else if (merged.length === 3) {
    displayLimit = 3;
    gridClasses = "grid grid-cols-3";
  } else if (merged.length === 4) {
    displayLimit = 4;
    gridClasses = "grid grid-cols-2 grid-rows-2";
  } else {
    // 5 件以上: 4 カラム表示、最終タイルに "+N" オーバーレイ
    displayLimit = 4;
    gridClasses = "grid grid-cols-2 md:grid-cols-4";
  }

  // "+N" オーバーレイのカウントは lightbox が扱う「画像」基準で算出する。
  // merged.length - displayLimit だと動画混入時に lightbox の実画像数とズレるため、
  // displayLimit タイル目以降にある画像の枚数を数える。
  const hiddenImageCount =
    merged.length > displayLimit
      ? merged
          .slice(displayLimit)
          .filter((m) => detectMediaSourceType(m.url) !== "video").length
      : 0;

  const renderTile = (item: GalleryItem, i: number): ReactElement => {
    const isLastDisplayed = i === displayLimit - 1;
    const showOverlay = isLastDisplayed && hiddenImageCount > 0;
    const isVideo = detectMediaSourceType(item.url) === "video";

    // 画像の場合は lightbox 内の index を imageItems サブセットで解決
    const imageIndex = isVideo
      ? -1
      : imageItems.findIndex((m) => m.url === item.url);

    return (
      <div
        key={`${item.url}-${i}`}
        className="relative aspect-[4/3] overflow-hidden bg-muted"
      >
        {isVideo ? (
          <video
            src={item.url}
            controls
            playsInline
            preload="none"
            className="h-full w-full object-cover"
          />
        ) : (
          <button
            type="button"
            onClick={() => setLightboxIndex(imageIndex)}
            className="absolute inset-0 cursor-pointer transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            aria-label={`ギャラリー画像 ${imageIndex + 1}`}
          >
            <Image
              src={item.url}
              alt={item.alt}
              fill
              sizes="(min-width:1024px) 33vw, 50vw"
              className="object-cover"
            />
          </button>
        )}
        {/* "+N" overlay は動画・画像問わず別 button で重ねる。
            こうすることで最終タイルが動画でも overlay クリックが inert にならない。 */}
        {showOverlay && (
          <button
            type="button"
            onClick={() => {
              // 最後に表示された画像（または非動画タイル）の imageIndex を起点に lightbox を開く
              const firstHiddenImageIndex = imageItems.findIndex((m) =>
                merged.slice(displayLimit).some((h) => h.url === m.url),
              );
              setLightboxIndex(
                firstHiddenImageIndex >= 0
                  ? firstHiddenImageIndex
                  : Math.max(0, imageItems.length - 1),
              );
            }}
            className="absolute inset-0 flex cursor-pointer items-center justify-center bg-black/50 text-2xl font-bold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            aria-label={`他 ${hiddenImageCount} 枚の画像を表示`}
          >
            +{hiddenImageCount}
          </button>
        )}
      </div>
    );
  };

  return (
    <>
      <div className={cn(gridClasses, "gap-2", className)}>
        {merged.slice(0, displayLimit).map((item, i) => renderTile(item, i))}
      </div>
      {/* key={lightboxIndex} でリマウントして initialIndex の変更を反映（Task 7 の契約） */}
      <GalleryLightbox
        key={lightboxIndex}
        items={imageItems}
        initialIndex={Math.max(0, lightboxIndex)}
        open={isOpen}
        onOpenChange={(open) => setLightboxIndex(open ? lightboxIndex : -1)}
      />
    </>
  );
}

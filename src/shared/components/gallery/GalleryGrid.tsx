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

import { useState, type ReactElement } from "react";
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

  const overflow = merged.length - displayLimit;

  const renderTile = (item: GalleryItem, i: number): ReactElement => {
    const isLastDisplayed = i === displayLimit - 1;
    const showOverlay = isLastDisplayed && overflow > 0;
    const isVideo = detectMediaSourceType(item.url) === "video";

    // 画像の場合は lightbox 内の index を imageItems サブセットで解決
    const imageIndex = isVideo
      ? -1
      : imageItems.findIndex((m) => m.url === item.url);

    const handleClick = () => {
      if (isVideo) return; // 動画タイルはクリックアクションなし（controls で制御）
      setLightboxIndex(imageIndex);
    };

    return (
      <button
        key={`${item.url}-${i}`}
        type="button"
        onClick={handleClick}
        disabled={isVideo}
        className={cn(
          "relative aspect-[4/3] overflow-hidden bg-muted transition",
          !isVideo &&
            "cursor-pointer hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
          isVideo && "cursor-default",
        )}
        aria-label={isVideo ? undefined : `ギャラリー画像 ${imageIndex + 1}`}
      >
        {isVideo ? (
          <video
            src={item.url}
            controls
            playsInline
            className="h-full w-full object-cover"
          />
        ) : (
          <Image
            src={item.url}
            alt={item.alt}
            fill
            sizes="(min-width:1024px) 33vw, 50vw"
            className="object-cover"
          />
        )}
        {showOverlay && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-2xl font-bold text-white">
            +{overflow}
          </div>
        )}
      </button>
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

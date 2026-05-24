"use client";

/**
 * メディアグリッド表示
 *
 * Block Link / Card Overlay パターン（業界標準・WAI-ARIA First Rule 準拠）:
 * - Primary action（カードクリック → 詳細ダイアログ）は native <button> を `absolute inset-0 z-10`
 *   でカード全体に重ね、native の keyboard / focus / disabled 契約をそのまま利用する
 * - Secondary actions（URL コピー / 削除）は別レイヤ（z-20）に配置し、
 *   `pointer-events-none` でコンテナを透過させ、各 <button> のみ `pointer-events-auto`
 *   で受け取ることで HTML 仕様違反（button ネスト）と `stopPropagation` を同時回避
 * - ARIA First Rule: `role="button"` + 自前キーボードハンドラよりも native <button> を優先
 *   （W3C WAI-ARIA APG: Disclosure / Navigation Menu / Accordion と同方針）
 */

import { useState } from "react";
import {
  IconCopy,
  IconTrash,
  IconFileText,
  IconMovie,
  IconFile,
} from "@tabler/icons-react";
import type { MediaData } from "@/admin/types/media-picker";
import { MediaDetailDialog } from "./MediaDetailDialog";
import { formatBytes } from "@/admin/lib/utils";
import { cn } from "@/shared/lib/cn";
import { TYPE_CONFIG } from "./constants";
import { createCopyUrlHandler, useDeleteMedia } from "./hooks";
import { isValidMediaType, MediaType } from "@/admin/lib/validations/media";

type Props = {
  items: MediaData[];
};

export function MediaGrid({ items }: Props) {
  const [detailItem, setDetailItem] = useState<MediaData | null>(null);
  const handleCopyUrl = createCopyUrlHandler();
  const { handleDelete, isPending } = useDeleteMedia();

  return (
    <>
      <div className="grid grid-cols-2 gap-4 @md/main:grid-cols-3 @2xl/main:grid-cols-4 @4xl/main:grid-cols-6">
        {items.map((item) => (
          <article
            key={item.id}
            className="group relative aspect-square rounded-lg border overflow-hidden transition-all duration-200 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 hover:shadow-lg"
          >
            {/* Thumbnail + Type badge */}
            <MediaThumbnail item={item} />
            <TypeBadge type={item.type} />

            {/* ① Primary target: native <button> covering entire card */}
            <button
              type="button"
              onClick={() => setDetailItem(item)}
              aria-label={`${item.alt || item.filename} の詳細を表示`}
              className="absolute inset-0 z-10 cursor-pointer rounded-lg focus-visible:outline-none"
            />

            {/* ② Hover / focus overlay: secondary actions + filename */}
            <div
              className={cn(
                "absolute inset-0 z-20 flex flex-col justify-between p-2",
                "bg-overlay pointer-events-none opacity-0 transition-opacity",
                "group-hover:opacity-100 group-focus-within:opacity-100",
              )}
            >
              <div className="flex justify-end gap-1">
                <button
                  type="button"
                  onClick={() => handleCopyUrl(item.url)}
                  className="inline-flex h-11 w-11 items-center justify-center rounded bg-overlay-action hover:bg-overlay-action-hover transition-colors pointer-events-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`${item.filename} の URL をコピー`}
                  title="URLをコピー"
                >
                  <IconCopy className="h-4 w-4 text-primary-foreground" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(item)}
                  disabled={isPending}
                  className="inline-flex h-11 w-11 items-center justify-center rounded bg-destructive/80 hover:bg-destructive transition-colors disabled:opacity-50 pointer-events-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`${item.filename} を削除`}
                  title="削除"
                >
                  <IconTrash className="h-4 w-4 text-primary-foreground" />
                </button>
              </div>

              <div className="text-primary-foreground text-xs">
                <p className="truncate font-medium">{item.filename}</p>
                <p className="text-primary-foreground/70">
                  {formatBytes(item.size)}
                </p>
              </div>
            </div>
          </article>
        ))}
      </div>

      <MediaDetailDialog
        item={detailItem}
        onClose={() => setDetailItem(null)}
      />
    </>
  );
}

function MediaThumbnail({ item }: { item: MediaData }) {
  switch (item.type) {
    case "IMAGE":
      return (
        <img
          src={item.url}
          alt={item.alt || item.filename}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      );
    case "VIDEO":
      return (
        <div className="w-full h-full bg-muted flex items-center justify-center">
          <IconMovie className="h-12 w-12 text-muted-foreground" />
        </div>
      );
    case "DOCUMENT":
      return (
        <div className="w-full h-full bg-muted flex items-center justify-center">
          <IconFileText className="h-12 w-12 text-muted-foreground" />
        </div>
      );
    default:
      return (
        <div className="w-full h-full bg-muted flex items-center justify-center">
          <IconFile className="h-12 w-12 text-muted-foreground" />
        </div>
      );
  }
}

function TypeBadge({ type }: { type: string }) {
  const mediaType = isValidMediaType(type) ? type : MediaType.OTHER;
  const config = TYPE_CONFIG[mediaType];

  return (
    <span
      className={cn(
        "absolute bottom-2 right-2 px-1.5 py-0.5 text-xs font-medium text-primary-foreground rounded",
        config.color,
      )}
    >
      {config.label}
    </span>
  );
}

"use client";

/**
 * MediaItem
 *
 * メディアグリッド/リストの個別アイテム
 */

import {
  IconCheck,
  IconFile,
  IconFileText,
  IconMovie,
  IconMusic,
} from "@tabler/icons-react";
import { cn } from "@/shared/lib/cn";
import type { MediaData } from "@/admin/types/media-picker";
import { formatBytes } from "../../../lib/utils";

interface MediaItemProps {
  media: MediaData;
  isSelected: boolean;
  onSelect: (media: MediaData) => void;
  viewMode: "grid" | "list";
  disabled?: boolean;
}

function isImageMedia(media: MediaData): boolean {
  return media.type === "IMAGE" || media.mimeType.startsWith("image/");
}

function MediaTypeIcon({ media }: { media: MediaData }) {
  switch (media.type) {
    case "VIDEO":
      return <IconMovie className="h-8 w-8 text-muted-foreground" />;
    case "AUDIO":
      return <IconMusic className="h-8 w-8 text-muted-foreground" />;
    case "DOCUMENT":
      return <IconFileText className="h-8 w-8 text-muted-foreground" />;
    default:
      return <IconFile className="h-8 w-8 text-muted-foreground" />;
  }
}

function MediaThumbnail({
  media,
  className,
}: {
  media: MediaData;
  className?: string;
}) {
  if (isImageMedia(media)) {
    return (
      <img
        src={media.url}
        alt={media.alt || media.filename}
        className={className}
        loading="lazy"
      />
    );
  }

  return (
    <div
      className={cn(
        "flex h-full w-full items-center justify-center bg-muted",
        className,
      )}
    >
      <MediaTypeIcon media={media} />
    </div>
  );
}

export function MediaItem({
  media,
  isSelected,
  onSelect,
  viewMode,
  disabled = false,
}: MediaItemProps) {
  const handleClick = () => {
    if (!disabled) {
      onSelect(media);
    }
  };

  if (viewMode === "grid") {
    return (
      <button
        type="button"
        aria-pressed={isSelected}
        onClick={handleClick}
        disabled={disabled}
        className={cn(
          "relative aspect-square rounded-lg overflow-hidden border-2 transition-all",
          "hover:ring-2 hover:ring-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          isSelected
            ? "border-primary ring-2 ring-primary"
            : "border-transparent",
          disabled && "opacity-50 cursor-not-allowed",
        )}
      >
        <MediaThumbnail media={media} className="h-full w-full object-cover" />
        {isSelected && (
          <div className="absolute right-1 top-1 rounded-full bg-primary p-1">
            <IconCheck className="h-3 w-3 text-primary-foreground" />
          </div>
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      aria-pressed={isSelected}
      onClick={handleClick}
      disabled={disabled}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors",
        "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        isSelected && "bg-primary/10",
        disabled && "opacity-50 cursor-not-allowed",
      )}
    >
      <div className="h-12 w-12 shrink-0 overflow-hidden rounded">
        <MediaThumbnail media={media} className="h-12 w-12 object-cover" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{media.filename}</p>
        <p className="text-sm text-muted-foreground">
          {formatBytes(media.size)}
        </p>
      </div>
      {isSelected && <IconCheck className="h-5 w-5 shrink-0 text-primary" />}
    </button>
  );
}

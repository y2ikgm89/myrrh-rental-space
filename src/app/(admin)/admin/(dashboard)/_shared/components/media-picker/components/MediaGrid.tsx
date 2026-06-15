"use client";

/**
 * MediaGrid
 *
 * メディアのグリッド/リスト表示
 */

import { MediaItem } from "./MediaItem";
import type { MediaData } from "@/admin/types/media-picker";

interface MediaGridProps {
  items: MediaData[];
  selectedIds: Set<string>;
  onSelect: (media: MediaData) => void;
  viewMode: "grid" | "list";
  isLoading?: boolean;
  canSelectMore: boolean;
}

/**
 * MediaGridSkeleton
 *
 * Suspenseフォールバック用のスケルトン
 */
// 固定長 skeleton 用の安定キー（配列 index をキーにしない: @eslint-react/no-array-index-key）
const SKELETON_KEYS = Array.from(
  { length: 12 },
  (_, i) => `media-grid-skeleton-${i}`,
);

export function MediaGridSkeleton() {
  return (
    <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-6">
      {SKELETON_KEYS.map((key) => (
        <div
          key={key}
          className="aspect-square animate-pulse rounded-lg bg-muted"
        />
      ))}
    </div>
  );
}

export function MediaGrid({
  items,
  selectedIds,
  onSelect,
  viewMode,
  isLoading = false,
  canSelectMore,
}: MediaGridProps) {
  if (isLoading) {
    return <MediaGridSkeleton />;
  }

  if (items.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground">
        画像が見つかりません
      </div>
    );
  }

  if (viewMode === "grid") {
    return (
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-6">
        {items.map((item) => (
          <MediaItem
            key={item.id}
            media={item}
            isSelected={selectedIds.has(item.id)}
            onSelect={onSelect}
            viewMode="grid"
            disabled={!selectedIds.has(item.id) && !canSelectMore}
          />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {items.map((item) => (
        <MediaItem
          key={item.id}
          media={item}
          isSelected={selectedIds.has(item.id)}
          onSelect={onSelect}
          viewMode="list"
          disabled={!selectedIds.has(item.id) && !canSelectMore}
        />
      ))}
    </div>
  );
}

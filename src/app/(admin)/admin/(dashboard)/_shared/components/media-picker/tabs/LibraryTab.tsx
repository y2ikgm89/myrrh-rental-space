"use client";

/**
 * LibraryTab
 *
 * メディアライブラリ選択タブ
 * React 19 use API + Suspense パターン
 */

import { use, useState, Suspense } from "react";
import { useMediaLibrary } from "@/admin/hooks/use-media-library";
import {
  MediaGrid,
  SearchBar,
  ViewToggle,
  MediaGridSkeleton,
} from "../components";
import type {
  GetMediaResult,
  MediaData,
  MediaFilters,
} from "@/admin/types/media-picker";
import type { MediaType } from "@/admin/lib/validations/media";
import type { MediaAcceptType } from "@/shared/lib/sections/types";
import { acceptToInitialMediaType } from "../accept-helpers";
import { cn } from "@/shared/lib/cn";

interface LibraryTabProps {
  selectedIds: Set<string>;
  onSelect: (media: MediaData) => void;
  canSelectMore: boolean;
  accept?: MediaAcceptType;
}

/** image-or-video accept 時の MediaType 切替ボタン UI */
const TYPE_FILTERS: ReadonlyArray<{ value: MediaType; label: string }> = [
  { value: "IMAGE", label: "画像" },
  { value: "VIDEO", label: "動画" },
];

/**
 * メディアグリッドのコンテンツ（use APIでPromiseを読み取り）
 */
function MediaGridContent({
  mediaPromise,
  selectedIds,
  onSelect,
  viewMode,
  canSelectMore,
}: {
  mediaPromise: Promise<GetMediaResult>;
  selectedIds: Set<string>;
  onSelect: (media: MediaData) => void;
  viewMode: "grid" | "list";
  canSelectMore: boolean;
}) {
  const result = use(mediaPromise);

  return (
    <MediaGrid
      items={result.items}
      selectedIds={selectedIds}
      onSelect={onSelect}
      viewMode={viewMode}
      isLoading={false}
      canSelectMore={canSelectMore}
    />
  );
}

export function LibraryTab({
  selectedIds,
  onSelect,
  canSelectMore,
  accept = "image",
}: LibraryTabProps) {
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");

  const initialType = acceptToInitialMediaType(accept);
  const initialFilters: MediaFilters = initialType ? { type: initialType } : {};
  const [activeType, setActiveType] = useState<MediaType | undefined>(
    initialType,
  );
  const showTypeFilter = accept === "image-or-video";

  const { mediaPromise, isInitialLoading, searchMedia, fetchMedia } =
    useMediaLibrary({
      initialFilters,
    });

  const handleSearchChange = (value: string) => {
    setSearch(value);
    searchMedia(value);
  };

  const handleTypeChange = (next: MediaType) => {
    if (next === activeType) return;
    setActiveType(next);
    // 検索語は維持しつつ type のみ差し替える
    const nextFilters: MediaFilters = {
      type: next,
      ...(search.length > 0 && { search }),
    };
    fetchMedia(nextFilters, 1);
  };

  return (
    <div className="space-y-4">
      {showTypeFilter && (
        <div
          role="tablist"
          aria-label="メディアタイプ切替"
          className="inline-flex items-center gap-1 rounded-md bg-muted p-1"
        >
          {TYPE_FILTERS.map((filter) => {
            const isActive = activeType === filter.value;
            return (
              <button
                key={filter.value}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => handleTypeChange(filter.value)}
                className={cn(
                  "inline-flex min-h-11 items-center justify-center rounded-sm px-3 py-2 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-card text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {filter.label}
              </button>
            );
          })}
        </div>
      )}
      <div className="flex items-center gap-2">
        <SearchBar value={search} onChange={handleSearchChange} />
        <ViewToggle mode={viewMode} onChange={setViewMode} />
      </div>

      {isInitialLoading ? (
        <MediaGridSkeleton />
      ) : (
        <Suspense fallback={<MediaGridSkeleton />}>
          <MediaGridContent
            mediaPromise={mediaPromise}
            selectedIds={selectedIds}
            onSelect={onSelect}
            viewMode={viewMode}
            canSelectMore={canSelectMore}
          />
        </Suspense>
      )}
    </div>
  );
}

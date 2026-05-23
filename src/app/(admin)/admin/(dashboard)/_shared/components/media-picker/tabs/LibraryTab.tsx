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
import type { GetMediaResult, MediaData } from "@/admin/types/media-picker";
import type { MediaAcceptType } from "@/shared/lib/sections/types";
import { acceptToInitialMediaType } from "../accept-helpers";

interface LibraryTabProps {
  selectedIds: Set<string>;
  onSelect: (media: MediaData) => void;
  canSelectMore: boolean;
  accept?: MediaAcceptType;
}

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
  const { mediaPromise, isInitialLoading, searchMedia } = useMediaLibrary({
    initialFilters: initialType ? { type: initialType } : {},
  });

  const handleSearchChange = (value: string) => {
    setSearch(value);
    searchMedia(value);
  };

  return (
    <div className="space-y-4">
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

"use client";

/**
 * useMediaSelection
 *
 * メディア選択状態を管理するフック
 */

import { useState } from "react";
import type { MediaData } from "@/admin/types/media-picker";
import type { SelectionMode, SelectedMedia } from "@/admin/types/media-picker";

/** アップロード結果（シンプルな型） */
interface UploadedMediaData {
  id: string;
  url: string;
  mimeType?: string;
  size?: number;
}

interface UseMediaSelectionOptions {
  mode: SelectionMode;
  maxSelections?: number;
  initialSelected?: SelectedMedia[];
}

interface UseMediaSelectionReturn {
  selectedIds: Set<string>;
  selectedMedia: SelectedMedia[];
  toggleSelection: (media: MediaData) => void;
  addUrlMedia: (url: string, alt?: string) => void;
  addUploadedMedia: (media: UploadedMediaData) => void;
  removeSelection: (id: string) => void;
  clearSelection: () => void;
  isSelected: (id: string) => boolean;
  canSelectMore: boolean;
}

export function useMediaSelection({
  mode,
  maxSelections = 10,
  initialSelected = [],
}: UseMediaSelectionOptions): UseMediaSelectionReturn {
  const [selectedMedia, setSelectedMedia] =
    useState<SelectedMedia[]>(initialSelected);

  const selectedIds = new Set(
    selectedMedia
      .filter((m): m is SelectedMedia & { id: string } => m.id !== null)
      .map((m) => m.id),
  );

  const canSelectMore =
    mode === "single" || selectedMedia.length < maxSelections;

  const toggleSelection = (media: MediaData) => {
    if (mode === "single") {
      setSelectedMedia([
        {
          id: media.id,
          url: media.url,
          ...(media.alt != null && { alt: media.alt }),
          filename: media.filename,
          mimeType: media.mimeType,
          size: media.size,
          source: "library",
        },
      ]);
    } else {
      setSelectedMedia((prev) => {
        const isAlreadySelected = prev.some((m) => m.id === media.id);

        if (isAlreadySelected) {
          return prev.filter((m) => m.id !== media.id);
        }

        if (prev.length >= maxSelections) {
          return prev;
        }

        return [
          ...prev,
          {
            id: media.id,
            url: media.url,
            ...(media.alt != null && { alt: media.alt }),
            filename: media.filename,
            mimeType: media.mimeType,
            size: media.size,
            source: "library",
          },
        ];
      });
    }
  };

  const addUrlMedia = (url: string, alt?: string) => {
    const urlMedia: SelectedMedia = {
      id: null,
      url,
      ...(alt !== undefined && { alt }),
      source: "url",
    };

    if (mode === "single") {
      setSelectedMedia([urlMedia]);
    } else {
      setSelectedMedia((prev) => {
        if (prev.length >= maxSelections) {
          return prev;
        }
        return [...prev, urlMedia];
      });
    }
  };

  const addUploadedMedia = (media: UploadedMediaData) => {
    const uploadedMedia: SelectedMedia = {
      id: media.id,
      url: media.url,
      ...(media.mimeType !== undefined && { mimeType: media.mimeType }),
      ...(media.size !== undefined && { size: media.size }),
      source: "upload",
    };

    if (mode === "single") {
      setSelectedMedia([uploadedMedia]);
    } else {
      setSelectedMedia((prev) => {
        if (prev.length >= maxSelections) {
          return prev;
        }
        return [...prev, uploadedMedia];
      });
    }
  };

  const removeSelection = (id: string) => {
    setSelectedMedia((prev) => prev.filter((m) => m.id !== id && m.url !== id));
  };

  const clearSelection = () => {
    setSelectedMedia([]);
  };

  const isSelected = (id: string) => selectedIds.has(id);

  return {
    selectedIds,
    selectedMedia,
    toggleSelection,
    addUrlMedia,
    addUploadedMedia,
    removeSelection,
    clearSelection,
    isSelected,
    canSelectMore,
  };
}

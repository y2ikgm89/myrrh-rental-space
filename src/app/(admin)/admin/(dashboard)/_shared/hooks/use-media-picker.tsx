"use client";

/**
 * useMediaPicker
 *
 * メディアピッカーの公開API
 * 各フォームから使用する統合フック
 */

import { useState, type ComponentType } from "react";
import { MediaPickerDialog } from "@/admin/components/media-picker/MediaPickerDialog";
import type { MediaUsage } from "@/admin/lib/validations/media";
import type { SelectionMode, SelectedMedia } from "@/admin/types/media-picker";

export interface UseMediaPickerOptions {
  /** 選択モード */
  selectionMode?: SelectionMode;
  /** 複数選択時の最大数 */
  maxSelections?: number;
  /** デフォルトの用途 */
  defaultUsage?: MediaUsage;
  /** URLタブを表示するか */
  showUrlTab?: boolean;
  /** 選択時のコールバック */
  onSelect?: (media: SelectedMedia[]) => void;
}

export interface UseMediaPickerReturn {
  /** ピッカーを開く */
  openPicker: (initialSelected?: SelectedMedia[]) => void;
  /** ピッカーを閉じる */
  closePicker: () => void;
  /** 開いているかどうか */
  isOpen: boolean;
  /** 選択されたメディア */
  selectedMedia: SelectedMedia[];
  /** ピッカーダイアログコンポーネント */
  MediaPicker: ComponentType;
}

export function useMediaPicker(
  options: UseMediaPickerOptions = {},
): UseMediaPickerReturn {
  const {
    selectionMode = "single",
    maxSelections = 10,
    defaultUsage = "GENERAL",
    showUrlTab = true,
    onSelect,
  } = options;

  const [isOpen, setIsOpen] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState<SelectedMedia[]>([]);
  const [initialSelected, setInitialSelected] = useState<SelectedMedia[]>([]);

  const openPicker = (initial?: SelectedMedia[]) => {
    setInitialSelected(initial ?? []);
    setIsOpen(true);
  };

  const closePicker = () => {
    setIsOpen(false);
  };

  const handleSelect = (media: SelectedMedia[]) => {
    setSelectedMedia(media);
    onSelect?.(media);
  };

  const MediaPicker = () => {
    return (
      <MediaPickerDialog
        isOpen={isOpen}
        onClose={closePicker}
        onSelect={handleSelect}
        selectionMode={selectionMode}
        maxSelections={maxSelections}
        defaultUsage={defaultUsage}
        initialSelected={initialSelected}
        showUrlTab={showUrlTab}
      />
    );
  };

  return {
    openPicker,
    closePicker,
    isOpen,
    selectedMedia,
    MediaPicker,
  };
}

/**
 * 単一画像選択用のシンプルなフック
 */
export function useSingleMediaPicker(
  options: Omit<UseMediaPickerOptions, "selectionMode"> = {},
) {
  const result = useMediaPicker({
    ...options,
    selectionMode: "single",
  });

  return {
    ...result,
    /** 単一選択された画像URL */
    selectedUrl: result.selectedMedia[0]?.url ?? null,
    /** 単一選択された画像alt */
    selectedAlt: result.selectedMedia[0]?.alt ?? null,
  };
}

/**
 * 複数画像選択用のシンプルなフック
 */
export function useMultipleMediaPicker(
  options: Omit<UseMediaPickerOptions, "selectionMode"> = {},
) {
  const result = useMediaPicker({
    ...options,
    selectionMode: "multiple",
  });

  return {
    ...result,
    /** 選択された画像URL配列 */
    selectedUrls: result.selectedMedia.map((m) => m.url),
  };
}

/**
 * File Plugin
 *
 * @description ファイル添付ダイアログプラグイン (Phase 5: MediaPicker 統合)
 *
 * `MediaPickerDialog`（accept="file"）を再利用して、選択時に
 * `FileNode` を `$insertNodeToNearestRoot` でカーソル位置の最近接 root に挿入する。
 * ファイル名は SelectedMedia.filename / alt / URL pathname から推定し、
 * 挿入後に Inspector で編集する設計 (Audio Phase 4 と同パターン)。
 */

"use client";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $insertNodeToNearestRoot } from "@lexical/utils";
import { MediaPickerDialog } from "@/admin/components/media-picker/MediaPickerDialog";
import type { SelectedMedia } from "@/admin/types/media-picker";
import { $createFileNode } from "../nodes/FileNode";
import type { DialogPluginProps } from "../config/dialog-registry";

// =============================================================================
// Helpers
// =============================================================================

function extractFilenameFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    return decodeURIComponent(pathname.split("/").filter(Boolean).pop() ?? "");
  } catch {
    return "";
  }
}

// =============================================================================
// Component
// =============================================================================

export function FilePlugin({ isOpen, onClose }: DialogPluginProps) {
  const [editor] = useLexicalComposerContext();

  const handleSelect = (media: SelectedMedia[]) => {
    const selected = media[0];
    if (!selected || selected.url.length === 0) {
      onClose();
      return;
    }

    const fileName =
      selected.filename ??
      selected.alt ??
      extractFilenameFromUrl(selected.url) ??
      selected.url;

    editor.update(() => {
      const fileNode = $createFileNode({
        url: selected.url,
        fileName: fileName.length > 0 ? fileName : selected.url,
      });
      $insertNodeToNearestRoot(fileNode);
    });

    onClose();
  };

  return (
    <MediaPickerDialog
      isOpen={isOpen}
      onClose={onClose}
      onSelect={handleSelect}
      selectionMode="single"
      defaultUsage="GENERAL"
      showUrlTab
      accept="file"
    />
  );
}

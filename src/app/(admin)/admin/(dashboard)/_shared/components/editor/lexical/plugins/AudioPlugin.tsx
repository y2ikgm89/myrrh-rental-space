/**
 * Audio Plugin
 *
 * @description 音声プレイヤー挿入ダイアログプラグイン (Phase 4: MediaPicker 統合)
 *
 * `MediaPickerDialog`（accept="audio"）を再利用して、選択時に
 * `AudioNode` を `$insertNodeToNearestRoot` でカーソル位置の最近接 root に挿入する。
 * タイトル / アーティストは挿入後に Inspector で編集する設計（業界標準: Notion / Slack の
 * 音声挿入と同じく URL 選択を最小ステップに集約）。
 */

"use client";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $insertNodeToNearestRoot } from "@lexical/utils";
import { MediaPickerDialog } from "@/admin/components/media-picker/MediaPickerDialog";
import type { SelectedMedia } from "@/admin/types/media-picker";
import { $createAudioNode } from "../nodes/AudioNode";
import type { DialogPluginProps } from "../config/dialog-registry";

// =============================================================================
// Component
// =============================================================================

export function AudioPlugin({ isOpen, onClose }: DialogPluginProps) {
  const [editor] = useLexicalComposerContext();

  const handleSelect = (media: SelectedMedia[]) => {
    const selected = media[0];
    if (!selected || selected.url.length === 0) {
      onClose();
      return;
    }

    editor.update(() => {
      const audioNode = $createAudioNode({
        url: selected.url,
        title: selected.alt ?? "",
        artist: "",
      });
      $insertNodeToNearestRoot(audioNode);
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
      accept="audio"
    />
  );
}

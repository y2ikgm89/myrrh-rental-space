/**
 * Inline Image Plugin
 *
 * @description インライン画像挿入ダイアログを提供するプラグイン
 */

"use client";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $getSelection, $insertNodes, $isRangeSelection } from "lexical";
import { MediaPickerDialog } from "@/admin/components/media-picker";
import { $createInlineImageNode } from "../nodes/InlineImageNode";
import type { SelectedMedia } from "@/admin/types/media-picker";

// =============================================================================
// Types
// =============================================================================

type InlineImagePluginProps = {
  isOpen: boolean;
  onClose: () => void;
};

// =============================================================================
// Component
// =============================================================================

export function InlineImagePlugin({ isOpen, onClose }: InlineImagePluginProps) {
  const [editor] = useLexicalComposerContext();

  const handleSelect = (media: SelectedMedia[]) => {
    if (media.length === 0) return;

    editor.update(() => {
      const selection = $getSelection();
      if ($isRangeSelection(selection)) {
        selection.removeText();
      }
      const nodes = media.map((m) =>
        $createInlineImageNode({
          src: m.url,
          altText: m.alt ?? "",
        }),
      );
      $insertNodes(nodes);
    });

    onClose();
  };

  return (
    <MediaPickerDialog
      isOpen={isOpen}
      onClose={onClose}
      onSelect={handleSelect}
      selectionMode="single"
      defaultUsage="POST"
      accept="image"
    />
  );
}

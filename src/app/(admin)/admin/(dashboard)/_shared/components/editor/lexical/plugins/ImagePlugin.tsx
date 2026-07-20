/**
 * Image Plugin
 *
 * @description 画像挿入ダイアログを提供するプラグイン
 */

"use client";

import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { $insertNodes } from "lexical";
import { MediaPickerDialog } from "@/admin/components/media-picker";
import { $createImageNode } from "../nodes/ImageNode";
import type { SelectedMedia } from "@/admin/types/media-picker";
import { useMediaUsage } from "../media-usage-context";

// =============================================================================
// Types
// =============================================================================

type ImagePluginProps = {
  isOpen: boolean;
  onClose: () => void;
};

// =============================================================================
// Component
// =============================================================================

export function ImagePlugin({ isOpen, onClose }: ImagePluginProps) {
  const [editor] = useLexicalComposerContext();
  const mediaUsage = useMediaUsage();

  const handleSelect = (media: SelectedMedia[]) => {
    if (media.length === 0) return;

    editor.update(() => {
      const nodes = media.map((m) =>
        $createImageNode({
          src: m.url,
          alt: m.alt ?? "",
          ...(m.width !== undefined && { width: m.width }),
          ...(m.height !== undefined && { height: m.height }),
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
      defaultUsage={mediaUsage}
      accept="image"
    />
  );
}

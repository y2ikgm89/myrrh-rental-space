/**
 * Gallery Item Inspector Panel
 *
 * @description GalleryItemNodeのプロパティ編集パネル
 */

"use client";

import { $getState, $setState } from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { IconPhoto, IconPhotoOff } from "@tabler/icons-react";
import {
  $isGalleryItemNode,
  type GalleryItemNode,
  galleryItemSrcState,
  galleryItemAltState,
  galleryItemCaptionState,
} from "../../nodes/GalleryNode";
import { InspectorHeader } from "../InspectorHeader";
import { InspectorFields } from "../InspectorFields";
import { useNodeUpdater } from "../hooks/use-node-updater";
import { Input, Label } from "@/admin/components/ui";
import { Button } from "@/admin/components/ui/button";
import { useSingleMediaPicker } from "@/admin/hooks/use-media-picker";

// =============================================================================
// Types
// =============================================================================

type GalleryItemInspectorPanelProps = {
  nodeKey: string;
  node: GalleryItemNode;
};

// =============================================================================
// Component
// =============================================================================

export function GalleryItemInspectorPanel({
  nodeKey,
  node,
}: GalleryItemInspectorPanelProps) {
  const [editor] = useLexicalComposerContext();
  const updateNode = useNodeUpdater(nodeKey, $isGalleryItemNode);

  const { src, alt, caption } = editor.read(() => ({
    src: $getState(node, galleryItemSrcState),
    alt: $getState(node, galleryItemAltState),
    caption: $getState(node, galleryItemCaptionState),
  }));

  const imagePicker = useSingleMediaPicker({
    accept: "image",
    defaultUsage: "POST",
    onSelect: (media) => {
      const selected = media[0];
      if (!selected) return;
      updateNode((n) => {
        $setState(n, galleryItemSrcState, selected.url);
        $setState(n, galleryItemAltState, selected.alt ?? "");
      });
    },
  });

  const handleAltChange = (value: string) => {
    updateNode((n) => {
      $setState(n, galleryItemAltState, value);
    });
  };

  const handleCaptionChange = (value: string) => {
    updateNode((n) => {
      $setState(n, galleryItemCaptionState, value);
    });
  };

  return (
    <div>
      <InspectorHeader title="ギャラリーアイテム" />

      <InspectorFields title="画像">
        <div className="space-y-2">
          <Label className="text-xs">画像</Label>
          <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-border bg-checker">
            {src ? (
              <img
                src={src}
                alt={alt}
                className="h-full w-full object-contain"
                draggable={false}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                <IconPhotoOff className="h-8 w-8" />
              </div>
            )}
          </div>
          <Button
            type="button"
            variant={src ? "outline" : "default"}
            size="sm"
            className="w-full"
            onClick={() => imagePicker.openPicker()}
          >
            <IconPhoto className="mr-2 h-4 w-4" />
            {src ? "画像を差し替え" : "画像を選択"}
          </Button>
        </div>

        <div className="space-y-2">
          <Label htmlFor="inspector-gallery-item-alt" className="text-xs">
            代替テキスト（ALT）
          </Label>
          <Input
            id="inspector-gallery-item-alt"
            value={alt}
            onChange={(e) => handleAltChange(e.target.value)}
            placeholder="画像の説明"
            className="text-sm"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="inspector-gallery-item-caption" className="text-xs">
            キャプション
          </Label>
          <Input
            id="inspector-gallery-item-caption"
            value={caption}
            onChange={(e) => handleCaptionChange(e.target.value)}
            placeholder="キャプションテキスト（任意）"
            className="text-sm"
          />
        </div>
      </InspectorFields>

      {imagePicker.mediaPickerDialog}
    </div>
  );
}

/**
 * Gallery Item Inspector Panel
 *
 * @description GalleryItemNodeのプロパティ編集パネル
 */

"use client";

import { $getState, $setState } from "lexical";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $isGalleryItemNode,
  type GalleryItemNode,
  galleryItemSrcState,
  galleryItemAltState,
  galleryItemCaptionState,
} from "../../nodes/GalleryNode";
import { InspectorHeader } from "../InspectorHeader";
import { InspectorSection } from "../InspectorSection";
import { useNodeUpdater } from "../hooks/use-node-updater";
import { Input, Label } from "@/admin/components/ui";

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

  const { src, alt, caption } = editor.getEditorState().read(() => ({
    src: $getState(node, galleryItemSrcState),
    alt: $getState(node, galleryItemAltState),
    caption: $getState(node, galleryItemCaptionState),
  }));

  const handleSrcChange = (value: string) => {
    updateNode((n) => {
      $setState(n, galleryItemSrcState, value);
    });
  };

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

      <InspectorSection title="画像">
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="inspector-gallery-item-src" className="text-xs">
              画像URL
            </Label>
            <Input
              id="inspector-gallery-item-src"
              value={src}
              onChange={(e) => handleSrcChange(e.target.value)}
              placeholder="https://example.com/image.jpg"
              className="h-8 text-sm"
            />
          </div>

          {src && (
            <div className="rounded-md overflow-hidden border border-border">
              <img
                src={src}
                alt={alt || ""}
                className="w-full h-auto object-cover max-h-32"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="inspector-gallery-item-alt" className="text-xs">
              代替テキスト（ALT）
            </Label>
            <Input
              id="inspector-gallery-item-alt"
              value={alt}
              onChange={(e) => handleAltChange(e.target.value)}
              placeholder="画像の説明"
              className="h-8 text-sm"
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
              className="h-8 text-sm"
            />
          </div>
        </div>
      </InspectorSection>
    </div>
  );
}
